# Obj DB

## Overview

The jsObjDB - a noSQL query storage system, with a query structure loosly based on Mongo. It can be used synchronously or asyncronously, and is very fast and flexible.

An jsObjDB stores any type of object - but it is generally more efficient to store one type of object per jsObjDB (indexes can be better utilized). All fields are optional.

Features include:

*	flexible queries
*	array support
*	joins
*	indexes (on properties, array, sub-objects)
*	cursors that also act like arrays
*	flexible update mechanisms.
*	async and sync support
*	sophistocated chaining of commands
*	Inserts, Upserts, Updates, Deletes.
*	event handlers and callbacks on most operations

##	Getting Started

### Installation

To include in a web page, copy the source to an appropriate folder, and include in your web page:

```
    <script src="/jsobjdb.js"></script>
```
or


```
    <script src="/jsobjdb.min.js"></script>
```

Your project must include either lodash or underscore - they are used by the library.

jsObjDB will also work in node.


### Creating a DB

	var db = new jsObjDB()

You can optionally pass in a primary key (a field that must exist, and will be uniquely indexed) and a flag to indicate whether all callbacks/handlers should be asyncronous.

	var async_db = new jsObjDB("myfield", true);
	var async_db = new jsObjDB(null, true);
	
The async flag defaults to false (sync operation) and a primary key is not required. The DB has its own internal unique key that is added to objects.

### Storing Data

Data can be stored item by item, or in bulk.

	var my_object = { a: 1, b: "happy", c: { x: [1,2,3]} };
	db.insertOne(my_object);
	
	var my_array = [];
	// fill array with a large number of objects
	...
	// insert into the DB
	db.insert(my_array);
	
When an object is stored inside the DB, it will be given a unique reference property ( _ id). You can use this if you need a unique way to access your objects, although it is not recommended as it may change in the future. You dont need to create an index for _ id - that is automatic.

There are two main ways to insert data - `insertOne` and `insert`.
	
`insertOne` takes a single object, and returns the object inserted (with its new _ id property), or will throw an exception on failure:
	
	var db = new jsObjDB("key");
	var obj = db.insertOne({ a: 1 }); //	exception - required field 'key' missing
	var obj = db.insertOne({ key: "hi" }); //	fine
	var obj = db.insertOne({ key: "hi" }); //	exception - duplicate
	
`insert` takes an array of objects, and will _not_ throw an exception on failure. Instead it will insert as many objects as possible, and return information about the results via a pair of cursors - `event.inserted` (successes) and `event.failed` (falures).

	var db = new jsObjDB("key");
	var arr = [];
	...		// fill arr with items to be inserted, some of which dont have 'key'.
	var ret = db.insert(arr);
	if (ret.failed.length > 0) {
		//	ret.failed is a cursor containing all failures
	}
	console.log("Inserted items: %o", ret.inserted);
	
`insert` and `insertOne` both accept a callback parameter that will be called on operation completion (unless an exception is raised). The callback may be executed synchronously or asynchronously, depending on the async flag used during DB construction. See [callbacks](#callbacks).

### Retrieving Data

Data can be fetched using queries via search functions - `find`, `findOne` and `findWhere`. (see Query Structure below for more information on the queries themselves).

To return _one_ element that has a field "a" with the value 1:
	
	var obj = db.findOne({a: 1});

If there are several elements that match this query - a random one will be returned. If there are no elements matching, then findOne returns null.

To retrieve a number of elements, use `find` which will return a cursor:

	var cursor = db.find({a: 1});
or

	 //	return all elements
	var cursor = db.find();
	var cursor = db.find({});
	
	//	Return all objects with a property a.b > 5. 
	var cursor = db.find({ "a.b": {$gt: 5 }});
	//	Return all objects with array value a.b[7] > 7 and b in [1, 2, 3]
	var cursor = db.find({ "a.b[7]": { $gt: 7 }, b: { $in: [1, 2, 3]}});

See __Complex Queries__ below for more examples of queries, and __Querie Structure__ below for full details about queries.

The variable `cursor` above holds a Cursor object, containing references to all elements that matched the query. A cursor object can be treated as an array:

	for (var i=0; i<cursor.length; i++) {
		var obj = cursor[i]
		...
	}
	
or traversed using lodash (or underscore):

	_.foreach(cursor, function(item, idx) {
		...
	})

A cursor supports chaining, and a large number of sophistocated functions, for example:
	
	var cursor = db.find().sort("b").each(function(item) {...}).delete();
	
This command will create a cursor representing all elements from the db database (`db.find()`). It then sorts them on the value of the property "b" (`.sort("b")`). It then calls the function on each element, and finally deletes all those elements from `db`.

The returned value, in variable `cursor`, will contain all elements that were deleted. Note that cursors are normally associated with a DB, but after a delete operation, the cursor contains the deleted elements, but they are orphaned (i.e. the no longer exist in the DB). The cursor itself is no longer associated with a DB.

`findWhere` let you use a function to choose the elements to include in the result set (Cursor). Only items where the function returns true will be included. 

	var cursor = db.findWhere(function(item) { return item.a > 5; });
	
Note that findWhere cannot use indexes, and so will scan all values in the DB.

#### Complex Queries Examples

To find all objects with an element greater than some number:
	
	 // objects with a > 6
	var cursor = db.find({ a: { $gt: 6 }});
	
	//	objects with a==1 or a==2 or a==3, AND b==6
	//	note that {b:6} is shorthand for {b: {$eq: 6}}
	var cursor = db.find({a: { $in: [1, 2, 3] }, b: 6 });
	
	//	objects with arrays containing a value
	db.insert({ b: 6, a: [1, 2, 3], c: 7 });
	var cursor = db.find({ a: { $contains: 3 }});
	
	//	objects with a sub-object containing a value that is one of a list
	//	Note that queries containing complex field names need to be quoted
	var cursor = db.find({ "a.b": { $in: [1 2 3] }});
	//	Using the above query - the results on these objects will be	{ a: 5, b: 5 } // no match. a is not an object
	{ a: { c: 6}}  // no match. a does not contain a property b.
	{ a: { b: 5 }} // no match. a.b is not in [1..3]
	{ a: { b: 1 }} // match. a.b is in [1..3]

	
	//	To use regular expressions to match:
	db.insert({a: "this is not matched"});
	db.insert({a: "ismatched"});
	var cursor = db.find({ a: { $match: "^[a-z]*$" }}); // a is made up of letters only.
	
	//	Searching on a field from within an array:
	var cursor = db.find({ "a.b[3]": { $in: ["a", "b", 4]}});
	//	results
	{ a: 5 }				//	no match. a is not an object
	{ a: { b: 5 }}			//	no match. a.b is not an array
	{ a: { b: [1, 2] }}		//	no match. a.b[3] does not exist
	{ a: { b: [4, 1, 2, "a"] }}		//	match. a.b[3] == "a"
	

### Updating Data
Data in the database is changed using one of the following calls:

*	update({query}, {update});
*	upsert([items]);
*	upsertOne(item);

Note that all of these calls support callbacks and event handlers (see below).

#### Update

An update consists of two parts - a query to select a number of elements to change, and an update that specifies how all selected objects will change.

Example: change all objects that match the query by setting the property `b` to 5.

	db.insertOne({ a:1, b:2} );
	db.insertOne({ a:1, c:1 });
	db.insertOne({ a:2 });
	
	db.update({ a: {$lt: 2} }, {b: {$set: 5}});
	
	db.find();
	//	returns {a:1, b:5}, {a:1, b:5, c:1}, {a:2}
	//	the first 2 were modified, the last wasn't (a >= 2)

Update clauses can perform very sophistocated changes to objects - see the section __Update Structure__ below for more details. 

	db.insertOne({a: { c: 6});
	db.update({}, { "a.b": {$push: 6}, "a.c": { $inc: 1 }});
	db.find();
	//	returns {a: {b: [6], c: 7}}
	//	a.b is created because it didn't exist, then 6 pushed into it
	//	a.c is incremented.
	
Updates can also be applied to any cursor, and so can be chained:

	db.insertOne({a:1, b:2});
	db.find({a: 1}).each(function(item) { console.log(item); }).update({c: 2});
	db.findOne({a:1});
	//	prints {a:1, b:2} (the function, which calls console.log)
	//	then updates the property c to 2
	//	the findOne will return {a: 1, b: 2, c: 2}

Note that `{c: 2}` is equivalent to `{c: {$set: 2}}` for updates.

#### Upserts

If you want to update a set of items, OR insert them if they dont exist, then use the upsert function. There are two variants - upsert (takes an array) or upsertOne (takes a single element).

For each item, the DB is scanning using the item's:

*	the _id field (if it exists).
*	the primary key

If a match is found, the db object is updated using properties for item. If a match is not found, the item will be inserted.

	var db = new jsObjDB("a");
	//	Note that the second item will fail due to a duplicate key, but others will be inserted.
	db.insertOne([{ a: 1, b: 2}, { a: 1, b: 3}, { a: 2, b: 6}, { a: 3, b: "hello"});
	
	db.upsertOne({a: 1, c: 4});	// item exists. Adds c:4 to it. a:1 is already there.
	db.upsertOne({a: 4, c: 5});	// item item does not exist. Inserted.
	
### Deleting Data

Data is deleted by selecting it with a query.

	db.delete({a: 1});
	db.delete({b: {$contains: 5}});
	
Data can also be deleted using a cursor:

	db.find({a: 1}).delete();
	
Note that the `db.delete` function _returns an event object_ and not a cursor. The event object is also passed to callbacks and event handlers. The event object contains 1 cursor, the set of objects that were deleted, and a set of objects that failed.
	
## [Callbacks](id:callbacks)

Most DB functions can accept a callback and binding. This callback will be called upon completion of given function/operation.

If the DB was constructed with 'async' set to true, the callback will be made asynchronously.

Callbacks are passed an event object, which will have one or more of the following properties:

*	__type__: one of "insert", "upsert", "update", "delete", representing the operation that was performed.
*	__inserted__: a cursor containing the objects that were inserted into the database. Present during inserts and upserts.
*	__updated__: a cursor containing the objects that were updated in the database. This property shows the modified objects. Present during upsert and opdate operations.
*	__deleted__: a cursor containing the objects that were deleted from the database. This cursor is not attached to the database - the objects are orphans and will disappear when the cursor goes out of scope. Present during delete operations.
*	__failed__: a cursor containing the objects that failed to be deleted, inserted or updated. Present during all operations.

The callback will be bound to `binding` parameter, or the jsObjDB/Cursor if no binding parameter is provided.

	var db = new jsObjDB("b");
	db.insertOne({a:1,b:2});
	db.insertOne({a:2,b:3});
	db.insertOne({a:3,b:4});
	db.update({a:1}, {c: {$inc: 1}}, function(event) {
		//	event.updated is a cursor
		event.updated.each(console.log);
	});
	//	prints {a:1, b:1, c:1}
	//	The query finds {a:1, b:2}, and the update
	//	increments c by 1 (because c does not exist, it is assumed to be 0)
	
	db.update({a:1}, {b: 3}, function(event) {
		if (event.failed.length > 0) {
		//	event.failed is a cursor with every failed update.
		//	In this case, cannot set b=3 because b has a unique index
		...	// handle error
		}
	});
	//	Note that the event descriptor is also returned by most
	//	operations.
	var event = db.update({a:1}, {b: 3});
	if (event.failed.length > 0) {
		... //	handle errors
	}	
	
## Cursors

A Cursor object contains a list of items selected from an jsObjDB. Any function on jsObjDB that returns a set of data will actually return a cursor. Most functions on cursors will also return cursors, making it possible to chain cursor functions together. For example:

	var first = db.find().sort("b[4]").uniq("c").first();

This function will sort all elements of the database on `b[4]`, then ensure each possible value of `c` occurs only once, and then return the first. That is, the first() function returns an object and not a cursor.

Cursors usually only contain reference to objects that exist in an jsObjDB. However, if the cursor is created during a delete operation - all of its objects will have been removed from their DB, and so the cursor forms their only reference (i.e. they are orphans).

Cursor objects are designed for walking (using _.each, or the built in .each) and various other chained functions. They are array like objects, supporting foreach, [], length.

Cursor objects are _not_ created by users - they are automatically created as a way to return sets of data.

### Cursor Functions

Cursors support the following chainable functions:

*	sort
*	uniq
*	each
*	async_each
*	call
*	async_call
*	filterWhere
*	join
*	delete
*	update

Cursors also support the following functions that do not support chaining:

*	first - returns the first object
*	last - returns the last object
*	nth - returns the nth object (like [])
*	exists - returns true or false if a query will find items
*	indexOf - returns the index of the first item to match a query

### Cursor Examples

	var db = new jsObjDB();
	...		//	fill with data
	var deleted = db.find({a:1}).delete();
	//	deleted holds a cursor with items deleted from db. The cursor is 
	//	not associated with the DB - the objects are now orphans and will
	//	disappear once the cursor goes out of scope.
	
	var obj = db.find({a:1}).sort("b").first();
	//	obj has a:1 and the lowest value for "b"
	
	var bigItems = db.find().filterWhere(function(item) {
		return item.a>1000;
	});
	//	Return a cursor with all objects having item.a > 1000
	
	db.find({a:1}).async_each(function(item) {
		// insert into DOM
		...
	});
	//	This will call the function asynchronously for each object
	//	that has a==1. It could be used, for example, to insert
	//	items into the DOM.
	//	Each function call is set up asyncronously using setTimeout.

	db.find({a:1}).sort("b").async_call(function(cursor) {
		// insert into DOM
		...
	});
	//	This will call the function asynchronously ONCE passing it a 
	//	cursor containing all objects with a==1. 
	//	The objects will be sorted on b.
	//	There is only one function call, and it is setup asyncronously using setTimeout.
	
	

### Cursor Joins

Cursors also support join operations - where a cursor is joined with a jsObjDB instance on a property. For example:

	var db1 = new jsObjDB();
	var db2 = new jsObjDB();
	//	insert a large amount of data
	var cursor = db1.find({a: 1}).join(db2, "b");

This returns a cursor containing objects constructed by merging elements of db1 that have `a==1`, with elements of db2, only if the elements have the same value for b - that is an element x from db1 will be merged with element y from db2 if x.b == y.b.

The objects in the returned cursor are actually a merge of all properties of x (from db1) with y (from db2).

More complex join operations are possible:

	var cursor = db1.find().join(db2, "b", "lt", "c")
	
The elements held in the cursor will be a merge of x (from db1) and y (from db2) if y.b < x.c.

When merging objects, if both x and y (above) have a property, then the cursor property (x in the example above) will have precedence over the merged db property.

Note that the _ id value for each returned element will point to an entry contained within db1 (in the above examples), but the elements _are not from db1_, they are freshly constructed joined objects. The cursor is not linked to a DB directly.


## Indexes

jsObjDB supports indexes. You can have as many indexes active as you like, but each index will have a (small) cost for upkeep during changes.

Indexes provide a very large speed boost to queries, so choose them wisely. It is usually better to have a few extra indexes, with the resultant large increase in search speed because the cost of maintenance is low.

You can create or remove indexes on an jsObjDB at any time. During index construction all existing elements will be correctly added in.

Index objects should not be constructed by the user - instead let the jsObjDB instance manage all indexes. You should instead create them with the `addIndex` function on your jsObjDB object.
	
	var db = new jsObjDB();
	db.addIndex("a");
	
Indexes can be created on properties, sub-object properties and arrays. When you index an array, you are actually indexing all elements in the array.

	db.addIndex("b.c");		// b.c is an array
	db.find({"b.c": { $contains: 4}}); // uses index to find objects with '4' in the b.c array.
	
	
Indexes can be added and removed at any time. To remove an index, use `removeIndex`:
	
	db.removeIndex("b.c");	//	removes the index added above.
	
Indexes have two properties:

*	__required__: every object that is inserted into this database _must_ have a value for the indexed property. Defaults to false;
*	__unique__: every object that is inserted into this database _must_ have a unique value for the indexed property. Defaults to false.

When you create an instance of jsObjDB, you can provide a primary key - which is simply an index with `required==true` and `unique==true`. The primary key is also used during `upsert` operations, when searching for existing objects.

Indexes currently only provide speed advantage to $eq, $in, and $contains operators.

### Efficiency

When executing a query, if there are multiple indexes that could be used, the DB engine chooses the index that will give the greatest speed boost. It does this by looking for the index that partitions the data the most - that is, the index holds the largest number of unique entries for the indexed column. 

This means that the best index has a wide variety of values. 


## Query Structure

Queries for finds and deletes are very flexible. In general the query has one of the following structures:

    { property: value }
    { property: value, ... }
    { property: { $op: value }}
    { property: { $op: value }, ... }

The operators (op) available are:
	
	in, nin, lt, gt, le, ge, eq, ne, exists, match, contains

Examples:

    { a: { $exists: true }}    //  has property a
    { a: { $exists: false }}    // does not have property a
    { "a.b": { $contains: 7 }}    // a.b is an array, and contains 7
    { "a.b": { $contains: 7 }}    // a.b is an array, and contains 7
    { "a.b": { $in: [1, 5, "a"] }}    // a.b is one of 1, 5 or "a"
    { a: {$eq: 5 }}			//	a == 5
    { a: 5 }				//	a == 5. This is a shorthand for $eq
    { a: { $ge: 5 }, b: 5 }	// a >= 5 and b == 5
    { "a[7]": {$ne: 5 }}		//	a[7] != 5
    { "a[7].b": {$ne: 5 }}		//	a[7].b != 5
  
## Update Structure

Updates require both a query (to select elements to update) and an update (what changes to make to selected elements). The query part is identical to queries for find and delete.

The update part is flexible and supports a large number of modifications to elements. Updates have the following form:

    { property: value }
    { property: value, ... }
    { property: { $op: value }}
    { property: { $op: value }, ...}

where operators are:

*	dec - decrement by value 
*	inc - increment by value
*	set - set the value
*	push - push the value onto the array (exception if its not an array)
*	concat - append the elements in value onto the array (both must be arrays)
*	setadd - add the value to the array, if it doesn't already exist. 
*	pop - pop value elements from the array from the front (-n) or end (n)
*	pull - remove matching elements. The value can be a value or array of values to be removed

Examples:

	//	Decrement a in all objects by 5.
	db.find().update({ a: {$dec: 5}});
	
	//	Set a.b to "hello" for all objects
	db.find().update({ a: {$set: "hello"}});

	//	Set a.b[7] to "hello" for all objects
	db.find().update({ "a.b[7]": {$set: "hello"}});

	//	For all items with a property 'a' that is an array, and
	//	where 'a' contains the value 6... and remove it.
	db.find({ a: { $contains: 6 }}).update({ a : { $pull: 6}});
	
	//	Add 6 to all objects with an array 'a' (if they dont already contain it)
	db.find().update({ a : { $setadd: 6}});
	
	//	Append [1, 2, 3] onto all array properties 'a'
	db.find().update({ a : { $concat: [1, 2, 3]}});

Note that `{a: 5}` is shorthand for `{a: { $set: 5 }}`.
	
If an object does not contain a property when an update is being applied to that property, then the following rules apply:

*	$set:   the property is created and set to value
*	$inc:   the property is created and set to value
*	$dec:   the property is created and set to -value
*	$push:  the property is created as an array, and the value added
*	$setadd: the property is created as an array and the value added
*	$pull:  the property is created and left empty
*	$pop:   the property is created and left empty


## Event Handlers

One or more events are fired on _on every modification operation_ on a database - be it insert, update, delete or upsert. Events are not generated on find type operations (find, findOne, findWhere).

[Note: event handlers used to be called delegates, but have been significantly improved. You can still use an event handler like a delegate by using the "all" event.]

Event handlers are set on the jsObjDB instance using `on`:

	var db = new jsObjDB("col");
	on("insert", function(event) {
		console.log(event.inserted);
		console.log(event.failed);
	}, this);
	on("update", function(event) {
		console.log(event.updated);
		console.log(event.failed);
		...
	}, this);

There are 2 types of events - Operation and Changeset.

**Operation Events** - are events associated with an operation. These are:

*	insert
*	update
*	upsert
*	delete
*	all

Operation events are always called when the operation is executed, whether or not any changes occurred.

For example:

	var db = new jsObjDB("col");
	db.on("insert", function(event) {
		event.failed.each(function(item) {
			//	Handle the fact that item failed to be inserted
		});
	}, this);
	
	db.on("all", function(event) {
		console.log("Event type", event.type);
		... work with event.inserted, event.failed, event.updated,
		... event.deleted.
	})

The special operation event `all` is called on any operation.

**Changeset Events** - are events associated with a set of changes to the DB. A single operation event may generate several changeset events - for example: an `upsert` operation will potentially generate some records that are _inserted_, some records that are _updated_, and some records that _failed_ to get inserted or updated (perhaps due to key voilations). 

Changeset Events are _only_ called when changes actually happen, whether or not an operation occurs. This means that if an operation actually generates no changes, then the operation event will fire, and the changeset event will no.

The changeset events are:

*	inserted
*	deleted
*	updated
*	failed - called when any operations fail.

Example:

	db.on("deleted", function(event) {
		//	Cascade the deletes
		//	Remember that the deleted event is only called when 
		//	deletes actually happen, so event.deleted will not
		//	be empty.
		event.deleted.each(function(item) {
			//	item contains an object just deleted
			...
		})
	});

**Async** - All event handlers honor the async flag set when the database was created.

Example:

	var db = new jsObjDB("col", true);	// primary key: col, async: true
	db.on("update", function(event) {
		//	This function will be called asynchronously.
		if (event.failed.length > 0) {
			//	handle the failure
		}
	});

**Cursors** - Event handlers are called even when the operation happens through a cursor. For example, the above event handler would be called here:

	var cursor = db.find({a: 7});
	cursor.update({b: 7});

Event handlers are a good way to watch for changes to the database, and to react by cascading that change somewhere - such as to the DOM. 

	var db = new jsObjDB("col");
	db.on("all", function(event) {
		switch (event.type) {
		case "insert":
			//	Insert new elements into DOM
			_.foreach(event.inserted, function(item) { ... });
			break;
		case "delete":
			//	Delete elements from the DOM
			_.foreach(event.deleted, function(item) { ... });
			break;
		case "update":
			//	Update elements in the DOM
			_.foreach(event.updated, function(item) { ... });
			break;
		case "upsert":
			//	Update or insert elements in the DOM
			_.foreach(event.inserted, function(item) { ... });
			_.foreach(event.updated, function(item) { ... });
			break;
	}
	
