/*jslint node: true */ //  Permit file level "use strict"
/*jslint nomen: true */ //  Permit leading "_" character
/*jslint todo: true */ //  Permit TODO


/**
 * @fileOverview
 * @author Paul Reddy (paul@kereru.org), Scott Woods
 * @version 1
 * @requires lodash
 */


"use strict";

//  Set to false if we are not using node.js
var is_node = (typeof module !== 'undefined' && module.exports);
if (is_node) {
    var _ = require("../lib/lo-dash.min.js");
}



/******************************************************************************************/

/**
 * A DBEvent is created in response to some modification to the DB.
 * It holds information related to that change in a set of cursors.
 * Each cursor may be null (unusued), empty (no changes) or contain values.
 * <p>
 * The event also contains the event type in the 'type' property.
 * @class
 * @param {[[Type]]} type [[Description]]
 */
var DBEvent = function (type, inserted, updated, deleted, failed) {
    if (!type) {
        throw "Invalid event type"
    }
    this.type = type;
    this.inserted = inserted ? inserted : null;
    this.updated = updated ? updated : null;
    this.deleted = deleted ? deleted : null;
    this.failed = failed ? failed : null;
}

/******************************************************************************************/

/**
 * A Cursor object contains a list of items selected from an jsObjDB.
 * It usually contains only references to the set of objects.
 * Cursor object is designed for walking (using _.each, or the built in .each)
 * and various other chained functions. They are array like objects, supporting
 * foreach, [], length.
 * <p>
 * Note that the DB is optional - a cursor can refer to a set of deleted objects,
 * in which case the cursor holds the last reference to those objects. Certain
 * types of chaining cannot be done because these objects are not linked to a DB
 * (specifically delete - which requires a DB to delete from)
 * <p>
 * Cursors can be chained together, such as:
 *  cursor = db.find({a: 1}).each(fn, this).sort("a").delete();
 * At the end of that chain, all objects matching a === 1 will be passed to
 * the function fn (bound to this), then sorted on "a" (asc by default) then
 * deleted. The cursor variable will point to a cursor holding all objects that
 * were deleted. The cursor will *not* be bound to any database.
 * <p>
 * You can also join any cursor with a database (can be the same DB that cursor
 * is bound to, or any other).
 * <p>
 * A cursor is generally only created by operations on a database or a cursor, they
 * are not usually created by users.
 * <p>
 * @class
 * @param {Object} db    Database that actually holds the objects referred to here. Can be null.
 * @param {Array}  items List of items to initially populate the cursor with. Can be null.
 */
var Cursor = function (db, items) {
    this.db = db;
    if (items) {
        var items_len = items.length;
        for (var i = 0; i < items_len; i++) {
            this.push(items[i]);
        }
    }
};
Cursor.prototype = new Array();

/**
 * A cursor is a set of references to some elements in a DB.
 * One reference for each object and one reference to the DB. Each
 * reference is 8 bytes.
 * @returns {Number} Number of bytes (roughly) taken by this Cursor.
 *
 */
Cursor.prototype.sizeof = function () {
    return this.length * 8 + 8;
}
/**
 * Return a string like representation of the cursor.
 * @returns {String} String like representation of the cursor.
 */
Cursor.prototype.toString = function () {
    return "Cursor(" + this.length + " items)";
};
Cursor.prototype._sort = Cursor.prototype.sort;
/**
 * Sort elements in the cursor. This replaces the array sort function, because
 * it accepts more complex property names and array indexes - e.g. "a[3].b"
 *
 * @param   {String}  property Name of the property to sort on
 * @param   {Boolean} asc      Ascending? Defaults to true
 * @returns {Object}  Returns the cursor, sorted
 */
Cursor.prototype.sort = function (property, asc) {
    if (typeof property !== 'string') {
        throw "Property name must be provided for sorting";
    }
    asc = asc === undefined ? true : asc;
    this._sort(function (a, b) {
        var a_value = jsObjDB.getPropertyValue(a, property);
        var b_value = jsObjDB.getPropertyValue(b, property);
        var ret;
        if (a_value < b_value) {
            ret = -1;
        } else if (a_value > b_value) {
            ret = 1;
        } else {
            ret = 0;
        }
        if (!asc) {
            return -ret;
        }
        return ret;
    });
    return this;
};
/**
 * Return the first element in the cursor, or null if the cursor is empty.
 * @returns {Object} First element
 */
Cursor.prototype.first = function () {
    if (this.length > 0) {
        return this[0];
    } else {
        return null;
    }
}
/**
 * Returns the last element in the cursor, or null if the cursor is empty.
 * @returns {Object} Last element
 */
Cursor.prototype.last = function () {
    if (this.length > 0) {
        return this[this.length - 1];
    } else {
        return null;
    }
}
/**
 * Returns the nth element in the cursor. Note that this will return
 * null if n is outside the range of elements (<0, >=length).
 * You can use [] instead, which will return undefined if the element is
 * outside range.
 * @param   {Number} n index of the item
 * @returns {Object} The item to be returned.
 */
Cursor.prototype.nth = function (n) {
    if (n < this.length) {
        return this[n];
    } else {
        return null;
    }
}
/**
 * Returns true if there exists at least ONE item that matches the query
 * @param   {Object}  qry Query
 * @returns {Boolean} True if there exists at least one match.
 */
Cursor.prototype.exists = function (qry) {
    return this.filter(qry).length > 0;
}

/**
 * Return a Cursor with only items that have unique values for the given property.
 * Duplicates will be removed.
 * Note that the property can be of the form: "a[3].b.c"
 *
 * @param   {String} property Property that will be used for uniqueness tests.
 * @returns {Object} Cursor object is returned.
 */
Cursor.prototype.uniq = function (property) {
    if (typeof property !== 'string') {
        throw "A property name must be provided to uniq";
    }
    var newList = _.uniq(this, function (item) {
        return jsObjDB.getPropertyValue(item, property);
    });
    //    var newList = _.uniq(this, false, property);
    return new Cursor(this.db, newList);
};
/**
 * Call the given callback function for each item in the cursor. The call back is called
 * as cb(object, index, this)
 * @param   {Function} cb      Callback function called on each item.
 * @param   {Object}   binding Optional. Bound to the
 * @returns {Object}   Return the current cursor for more chaining
 */
Cursor.prototype.each = function (cb, binding) {
    binding = binding || this;
    _.each(this, cb, binding);
    return this;
};
Cursor.prototype.async_each = function (cb, binding) {
    binding = binding || this;
    var fn = _.bind(cb, binding);
    _.each(this, function (item) {
        setTimeout(function () {
            fn(item);
        }, 0);
    }, this);
    return this;
}
/**
 * Call the given callback, passing the cursor.
 * This can be used in the middle of a chain of calls.
 * @param   {Function} cb Callback function to call
 * @returns {Object}   Cursor object is returned.
 */
Cursor.prototype.call = function (cb, binding) {
    binding = binding || this;
    var f = _.bind(cb, binding);
    f(this);
    return this;
};
Cursor.prototype.async_call = function (cb, binding) {
    binding = binding || this;
    var fn = _.bind(cb, binding);
    setTimeout(function () {
        fn(this);
    }, 0);

    return this;
};

Cursor.prototype.filter = function (query) {
    var qry = jsObjDB.parseQuery(query);
    return new Cursor(this.db, _.filter(this, function (item) {
        return jsObjDB.doQueryMatching(item, qry);
    }));
};
/**
 * Find all elements using a custom test function. The function
 * should return true on a successful test.
 * @param {Function} cb      Callback for testing inclusion
 * @param {Object}   binding Context for the callback function
 */
Cursor.prototype.filterWhere = function (cb, binding) {
    if (!cb) {
        throw "Test function is required"
    }
    binding = binding || this;
    var testFn = _.bind(cb, binding);
    var cursor = new Cursor(this.db, _.filter(this, testFn));
    return cursor;
}

/**
 * Join two data sets. A cursor provides the first set, the db provides the second.
 * We create a new cursor where each element is a merged object containing
 * properties from cursor, and properties from db. Properties from cursor have
 * precendence (and the _id value points to the DB belonging to cursor)
 *
 * The join is done by creating a query of the form:
 *     db_prop: { operator: cursor_prop }
 *     db_prop: { $eq: db_prop }
 *
 * Note that all joins are *inner* (to use the semantics of SQL). If there is no
 * db object that matches a cursor object (and v.v) then nothing is returned for that row.
 *
 * NOTE: the objects are now *NOT* stored in the DB - instead they are copies.
 * Therefore you must take care in deletes and updates. They *do* contain the _id of the
 * cursor object.
 *
 * @param {Object} db          The jsObjDB providing the second set of values
 * @param {String} db_prop     The db property on which to merge.
 * @param {String} operator    The operator used to compare db_prop to cursor_prop, Defaults to $eq
 * @param {String} cursor_prop The cursor property on which to merge. Defaults to db_prop
 * @returns {Object}   Cursor object *not* linked to a DB, with all the merged objects.
 *
 */
Cursor.prototype.join = function (db, db_prop, operator, cursor_prop) {
    var cursor = _.reduce(this, function (coll, item) {
        operator = operator || "$eq";
        cursor_prop = cursor_prop || db_prop;
        var qry = {};
        //  Create { db_prop: { $op: cursor_prop_value }}
        var value = {};
        value[operator] = jsObjDB.getPropertyValue(item, cursor_prop);
        //        value[operator] = item[cursor_prop];
        qry[db_prop] = value;

        //        console.log("Searching for ", qry, item);
        var other = db.find(qry);
        _.each(other, function (o) {
            var res = {};
            //  Do it this way round. We want item to have precedence, especially its _id
            _.extend(res, o);
            _.extend(res, item);
            //            console.log("RES", res, item, o);
            coll.push(res);
        });
        return coll;
    }, new Cursor(this.db), this);
    return cursor;
};

/**
 * Delete all items in the Cursor from the DB.
 * Note that after this... the cursor is emptied because these items dont exist any more.
 * @returns {Object} undefined
 */
Cursor.prototype.delete = function () {
    this.db.delete({
        _id: {
            $in: _.pluck(this, "_id")
        }
    });
    this.db = null;
    return this;
};

/**
 * Execute a set of updates in order. The cursor should be ordered
 * if the order up updates is important.
 *
 * @param   {Object} changes Object containing the changes to be made
 * @returns {Object} Cursor, after changes made
 */
Cursor.prototype.update = function (changes) {
    if (!this.db) {
        throw "Cursor not attached to DB. Cannot be updated";
    }
    for (var i = 0; i < this.length; i++) {
        var item = this[i];
        this.db.update({
            _id: item._id
        }, changes);
    }
    return this;
};

Cursor.prototype.indexOf = function (query) {
    var qry = jsObjDB.parseQuery(query);
    var len = this.length;

    for (var i = 0; i < len; i++) {
        var item = this[i];

        if (jsObjDB.doQueryMatching(item, qry)) {
            return i;
        }
    }
    return -1;
}

/******************************************************************************************/
/**
 * An index for a store. The index is on a single property, and keeps a list of
 * property values in a map.
 * <p>
 * What happens if the item to be indexed is an array? Find would be looking for any items
 * that *contain* that value inside the array.
 * <p>
 * E.g. item = { a: 1, b: [1, 2, 3]}.
 * <p>
 * Create an index on "b" means that we can use a query like {b: { $contains: 3}}, whereby we are looking
 * for items where b contains 3.
 * <p>
 * Indexes are only created by the jsObjDB class, and it manages a set of indexes for a given
 * database, ensuring the index is kept up to date.
 * <p>
 * A key property for indexes is "partitions", which is an indication of roughly how well
 * the index is splitting the data. The bigger number, the better the index is performing.
 * In general the query engine will use an index with a bigger partition number.
 *
 * @class
 * @param {String}  property Name of the property to index.
 * @param {Boolean} unique   Are the value held in this index unique? If not, an exception will
 *                           be thrown on attempting to insert.
 * @param {Boolean} required Must every object added to the index have this value? An exception
 *                           will be thrown if the object does not contain the value, making
 *                           it impossible to add the object to the DB.
 *
 */
var ObjIndex = function (property, unique, required) {
    if (typeof property !== "string") {
        throw "Property name must be provided and be a string";
    }
    this.unique = unique === undefined ? false : unique;
    this.required = required === undefined ? false : required;
    this.property = property;
    this.values = {};
    //  Partitions is a representative of how many unique values there are.
    //  More partitions means a more effective index. The best index is a 
    //  unique one.
    this.partitions = 0;
};
/**
 * Convert the description of an index to JSON for storage.
 * <p>
 * Note that we dont usually persist index data - instead we rebuild the index during load.
 * Therefore we only need to store the index properties.
 *
 * @returns {String} JSON string representing the index properties.
 */
ObjIndex.prototype.toJSON = function () {
    return JSON.stringify({
        unique: this.unique,
        required: this.required,
        property: this.property
    });
}

/**
 * Provide a brief description of the index.
 * @returns {String} A brief description of the index.
 */
ObjIndex.prototype.toString = function () {
    return "ObjIndex(property:" + this.property + ", unique:" + this.unique + ", partitions:" + this.partitions + ")";
};
/**
 * Return the approximate size of this index.
 * An index is made up of a map of keys, each of which points to an array of values. Each value is a reference to the DB.
 * So the size of the index does not include the size of the objects it points to.
 *
 * @returns {Number} The approximate size, in bytes, of this object and its children.
 */
ObjIndex.prototype.sizeof = function () {
    var size = 0;
    size += 2 * 3 /* booleans */ + 2 * this.property.length /* string property name */ + 8 /* this.partitions - a number */ ;
    _.forOwn(this.values, function (value, key) {
        switch (typeof key) {
            // the object is a boolean
        case 'boolean':
            size += 4;
            break;

            // the object is a number
        case 'number':
            size += 8;
            break;

            // the object is a string
        case 'string':
            size += 2 * key.length;
            break;

        }
        size += value.length * 8; /* number of references to objects (assume 8 byte pointers) */
    }, this);
    return size;
}
/**
 * Add an item (or items) to this index. The index works on a specific property, so we grab the value
 * of that property, and store it in the index. If the item passed in is an array, we walk the
 * array adding each item.
 * <p>
 * If an exception is thrown during insertion, we attempt to remove *all* added elements from the index.
 *
 * Watch for unique keys.
 * @param {Object} item The item (or items) to be recorded in the index.
 */
ObjIndex.prototype.addItem = function (item) {
    var value = jsObjDB.getPropertyValue(item, this.property);
    //var value = item[this.property];
    if (value === undefined) {
        if (this.required) {
            throw "Key " + this.property + " is required (and is missing)";
        }
        return;
    }
    if (_.isArray(value)) {
        var len = value.length;
        try {
            for (var i = 0; i < len; i++) {
                this._addItemValue(item, value[i]);
            }
        } catch (e) {
            this._removeItemValue(item, value[i]);
            throw e;
        }
    } else {
        this._addItemValue(item, value);
    }
    //console.log("addItem: ", this.property, value, this.values[value]);
};
/**
 * Add a list of items to the index. Just uses addItem().
 *
 * @param {Array} items Items to be added to the index.
 */
ObjIndex.prototype.addItems = function (items) {
    _.each(items, function (item) {
        this.addItem(item);
    }, this);
}
/**
 * Workhorse routine for adding items to the index.
 * <p>
 * Adds the item. If a new index bucket is required, then the index is getting better
 * (meaning a bigger partition number).
 * <p>
 * @private
 * @param {Object}       item  The object to be inserted into the index.
 * @param {Value} value The value for the index property insize this item.
 */
ObjIndex.prototype._addItemValue = function (item, value) {
    if (!_.has(this.values, value)) {
        this.values[value] = [];
        this.partitions++;
    }
    //  If we are unique... dont permit a second item
    if (this.unique && this.values[value].length > 0) {
        throw "Duplicate item on index (" + this.property + ")";
    }
    this.values[value].push(item);


}
/**
 * Remove an item from an index - used when that item is removed from the underlying database.
 *
 * @param {Object} item The item that is being removed from the database
 */
ObjIndex.prototype.removeItem = function (item) {
    var value = jsObjDB.getPropertyValue(item, this.property);
    //var value = item[this.property];
    if (value === undefined) {
        //  Doesn't have the value
        return;
    }
    if (_.isArray(value)) {
        var len = value.length;
        for (var i = 0; i < len; i++) {
            try {
                this._removeItemValue(item, value[i]);
            } catch (e) {
                //  We keep going even on failure - want to remove as many as possible
                ;
            }
        }
    } else {
        this._removeItemValue(item, value);
    }

}
/**
 * Remove a list of items from the database.
 *
 * @param {Array} items The items to be removed.
 */
ObjIndex.prototype.removeItems = function (items) {
    _.each(items, function (item) {
        this.removeItem(item);
    }, this);
}

/**
 * The workhorse routine for removing items from the database.
 * <p>
 * @param   {Object}   item  The object to be removed from the database
 * @param   {Value}    value The value of the index property in that object.
 */
ObjIndex.prototype._removeItemValue = function (item, value) {
    if (!_.has(this.values, value)) {
        //  Isnt part of the index
        return;
    }
    //  Remove it.
    _.remove(this.values[value], function (i) {
        return i._id === item._id;
    });
    if (this.values[value].length === 0) {
        delete this.values[value];
        this.partitions--;
    }
}
/**
 * Returns a list of _ids that have the given value
 *
 * @param   {Value} value Any type of value that we are looking for
 * @returns {Array} List of _ids (i.e. items in the DB) that have that value.
 */
ObjIndex.prototype.find = function (value) {
    if (!_.has(this.values, value)) {
        //  Isnt part of the index
        return null;
    }
    return this.values[value];
};

/******************************************************************************************/
/**
 * @class
 * A javascript storage engine for browsers and node.js.
 *
 * @param {String}  [prim_key] A unique and required key for the data. Is optional. Note that an
 *                           internal unique field named _id is always created anyway
 *                           and can be used for unique indexing if required. Defaults to none.
 * @param {Boolean} [async]    Should event handlers and callbacks be called asynchronously? Defaults to false.
 *
 * @example
 * var db = jsObjDB();
 * var db2 = jsObjDB("user_id", true);
 *
 */
var jsObjDB = function (prim_key, async) {
    this.async = async === undefined ? false : async;
    this.prim_key = prim_key;

    //  The actual data storage
    this.store = {};
    //  indexes
    this.indexes = {};
    //  Unique ref_id, used to create the _id values.
    this.ref_id = 0;
    //  number of items. Can't use "length" because we dont want to be seen as an array because 
    this._count = 0;
    //  Event Handlers that get notified on events. They are called in the order added for each event.
    this.event_handlers = {};

    if (this.prim_key) {
        this.addIndex(this.prim_key, true, true);
    }
    //    console.log("jsObjDB Constructed");
};

/**
 * Save this DB to persistent store (localStorage). If localStorage is not supported on this
 * browser, then an exception is raised.
 * @see jsObjDB#load
 * @example
 * var db = jsObjDB();
 * ...  // store lots of data
 * db.persist("MyData");
 * @param {String} name Name used to uniquely identify this jsObjDB in the localStore
 *
 */
jsObjDB.prototype.persist = function (name) {
    if (typeof localStorage === 'undefined') {
        throw "Local storage not supported in this browser"
    }
    //  localstorage only supports JSON. So we need to convert to JSON
    localStorage[name] = this.toJSON();
}
/**
 * Load this DB from the localStore. Note that you must construct an jsObjDB then
 * call "load" on it - i.e. this is not a constructor.
 * @see jsObjDB#persist
 * @example
 * var db = jsObjDB().load("MyData");
 *
 * @param   {String} name Name used to uniquely identify this jsObjDB in the localStore.
 * @returns {Object} The jsObjDB loaded. Actually just "this".
 */
jsObjDB.prototype.load = function (name) {
    var json = localStorage[name];
    return this.loadFromJSON(json);
}
/**
 * Load this DB from a JSON string.
 * Not usually for user consumption - but may be useful if the DB is being
 * transmitted.
 * @see jsObjDB#toJSON
 * @example
 * socket.onmessage = function (evt) {
 * var db = jsObjDB().loadFromJSON(evt.data);
 * };
 *
 * @param   {String} json JSON encoded instance of jsObjDB. Must have been created by toJSON().
 * @returns {Object} Returns "this" - the jsObjDB object.
 */
jsObjDB.prototype.loadFromJSON = function (json) {
    var data = JSON.parse(json);
    //  Build the database
    this.prim_key = data.prim_key;
    this.async = data.async;
    //  Just in case - clear out indexes etc.
    this.indexes = {};
    this.ref_id = 0;
    this.store = {};
    //  Add in the indexes
    _.each(data.indexes, function (def) {
        this.addIndex(def.property, def.unique, def.required);
    }, this);
    //  Remove all _id fields
    _.each(data.data, function (item) {
        delete item._id;
    });
    this.insert(data.data);
    return this;
}

/**
 * Save the jsObjDB to a JSON string.
 * @see jsObjDB#loadFromJSON
 * @example
 * var db = jsObjDB();
 * ...  // fill with data
 * socket.send(db.toJSON());
 *
 * @returns {String} Returns the JSON string
 */
jsObjDB.prototype.toJSON = function () {
    var dbDesc = {
        async: this.async,
        prim_key: this.prim_key
    };
    dbDesc.indexes = [];

    dbDesc.indexes = _.map(this.indexes, function (index) {
        return {
            unique: index.unique,
            required: index.required,
            property: index.property
        };
    });
    dbDesc.data = _.values(this.store);
    return JSON.stringify(dbDesc);
}
/**
 * Return the approximate size of this jsObjDB instance - including all data stored in it.
 *
 * @example
 * var db = jsObjDB();
 * ...  // fill with data
 * console.log("Database size is approximately", db.sizeof());
 *
 * @returns {Number} Approximate space used, in bytes, of this database, its storage and indexes.
 */
jsObjDB.prototype.sizeof = function () {
    var size = 0;
    size += 2 * 1 /* booleans */ + (this.prim_key ? 2 * this.prim_key.length : 0) /* string prim key name */ + 8 * 2 /* numbers (ref_id, count) */ ;
    //  Calculate the size of all indexes
    size += _.reduce(this.indexes, function (result, index) {
        return result + index.sizeof()
    }, 0);
    //  Store keys are all numbers
    size += this._count * 8;

    //  Calculate the size of all objects held in the store
    size += _.reduce(this.store, function (result, obj) {
        return result + jsObjDB.sizeOfObject(obj)
    }, 0);
    return size;
}


/**
 * Create a string descriptor of the jsObjDB. Useful for debugging.
 * @example
 * console.log(db.toString());
 *
 * @returns {String} String overview.
 */
jsObjDB.prototype.toString = function () {
    var indexes = [];
    _.forOwn(this.indexes, function (idx) {
        indexes.push(idx.toString());
    });
    return "jsObjDB (nitems:" + this._count + ", primkey:" + this.prim_key + ", indexes:" + indexes.join(",");
};


/**
 * An event handler is a method that is called on *any* change to the DB (insert, update, upsert, delete).
 *  on("<event>", func(event){});
 * where "<event>" is one of:
 *  // the set of operations
 *  update      the update function was called. Will be passed event.updated and event.failed.
 *  upsert      the upsert function was called. Will be passed event.updated, event.inserted and event.failed
 *  insert      the insert function was called. Will be passed event.inserted and event.failed
 *  delete      the delete function was called. Will be passed event.deleted.
 *  // the change sets
 *  inserted    some records were inserted, however it happened(upsert or insert). Will be passed event.inserted.
 *  updated     some records were updated. Will be passed event.updated
 *  deleted     some records were deleted. Will be passed event.deleted
 *  failed      some event happened, and some records failed. Will be passed event.failed.
 *  //  wildcard - on any change operation
 *  *           on any event. Will be passed event.inserted, event.updated, event.deleted, event.failed.
 *
 * In all cases, the event object will also contain the name of the operation - insert, update, delete, upsert.
 *
 * Change set handlers (inserted, updated, deleted, failed) will *only* be called if there were actually
 * changes to the DB. 
 * 
 * Operation handlers (insert, update, delete, upsert) will always be called when the operation is executed.
 * "*" handlers will always be called on any operation.
 *
 * The function will be called with an event object, which always contains a "type" field representing
 * the event. It will have one of the names above.
 * The event object includes one or more of the following cursors:<p>
 * <ul>
 *  <li>inserted: all items that were inserted<br>
 *  <li>deleted: all items that were deleted<br>
 *  <li>updated: all items that were updated<br>
 *  <li>failed: all items that failed to be inserted or updated<br>
 * </ul>
 *
 * Note that for a single operation - several handlers may fire. For example - for an upsert operation,
 * the following handlers will fire:
 *  upsert
 *  inserted (if any items are inserted)
 *  updated (if any items are updated)
 
 * @example
 * db.on("insert", function(event) {
 *     if (event.failed && event.failed.length > 0) {
 *     //   There are some failures... deal with it
 *     }
 *     if (event.inserted && event.inserted.length > 0) {
 *     //   There are some new records - add them to the DOM
 *     }
 *     ...
 * });
 * @param {String} event   The name of the event on which to attach a callback
 * @param {Function}      fn The function to call on any change
 * @param {Object}        binding  The object to bind the function to. (optional - defaults to "this")
 */
jsObjDB.prototype.on = function (event, fn, binding) {
    switch (event) {
    case "update":
    case "insert":
    case "delete":
    case "upsert":
    case "updated":
    case "inserted":
    case "deleted":
    case "failed":
    case "all":
        break;
    default:
        throw "Invalid event name: " + event;
    }
    binding = binding || this;
    fn = _.bind(fn, binding);

    //  Make sure there is a slot for this event type
    if (!this.event_handlers[event]) {
        this.event_handlers[event] = [];
    }
    this.event_handlers[event].push(fn);
    //    console.log("EVENT HANDLERS:", this.event_handlers);
}
/**
 * Remove all handlers for a specific event.
 *
 * @param   {String}    event The name of the event.
 */
jsObjDB.prototype.off = function (event) {
    this.event_handlers[event] = [];
}

/**
 * Call all event handlers, passing them information about the event. Depending on the
 * async flag on the DB, this may be done sync or async.
 * This is an internal function.
 * @private
 * @param {Object} event A descriptor of the event. Usually an object containing a list of
 *                       inserted, deleted and updated values in Cursors.
 */
jsObjDB.prototype.callHandlers = function (event) {
    // console.log("CallHandlers", event.type);
    //  Let our operation handlers know that something has happened
    _.each(this.event_handlers[event.type], function (handler) {
        if (this.async) {
            setTimeout(function () {
                handler(event);
            }, 0);
        } else {
            handler(event);
        }
    }, this);
    //  Call the catchall event handler
    if (this.event_handlers["all"] && this.event_handlers["all"].length > 0) {
        _.each(this.event_handlers["all"], function (handler) {
            if (this.async) {
                setTimeout(function () {
                    handler(event);
                }, 0);
            } else {
                handler(event);
            }
        }, this);
    }
    // Now let any change set handlers know that something has changed.
    //  Note that we use the [] accessor because the changeset name may not exist.
    _.forEach(["failed", "inserted", "updated", "deleted"], function (changeset) {
        if (event[changeset] && event[changeset].length > 0 &&
            this.event_handlers[changeset] && this.event_handlers[changeset].length > 0) {
            _.each(this.event_handlers[changeset], function (handler) {
                if (this.async) {
                    setTimeout(function () {
                        handler(event);
                    }, 0);
                } else {
                    handler(event);
                };
            }, this);
        }
    }, this);
}
/**
 * Add an index on a single property. Access to items can ben sped up
 * *significantly* (although only the $in and $eq operators are currently supported).
 * <p>
 * You can add indexes at any time, an attempt will be made to insert all existing elements
 * into that index. Any failure will cause the index to be discarded and an exception thrown.
 * <p>
 * Each index keeps tabs on how much it partitions the data - more partitioning (i.e. more unique
 * values) means a more efficient index. Conversely, an index where all objects stored have the
 * same value is a very inefficient index. At query time - the best index will be
 * chosen for use.
 *
 * @param {String}  property Name of the property
 * @param {Boolean} unique   Is this a unique index. @default false
 * @param {Boolean} required   Does every item need this value?
 */
jsObjDB.prototype.addIndex = function (property, unique, required) {
    unique = unique === undefined ? false : unique;
    required = required === undefined ? false : required;
    if (typeof property !== 'string') {
        throw "Property name must be provided and be a string";
    }
    if (_.has(this.indexes, property)) {
        throw "Duplicate index on " + property;
    }
    var index = new ObjIndex(property, unique, required);
    var failed = true;
    var ret = _.every(this.store, function (item, i) {
        try {
            index.addItem(item);
            return true;
        } catch (e) {
            return false;
        }
    });
    if (ret) {
        //  Success! We add the index in
        this.indexes[property] = index;
        return true;
    } else {
        //  Failure!! We discard the index and throw
        throw "Unable to create index - bad or duplicate value";
    }
};
/**
 * Remove an index.
 * @param {String} property The property that is indexed.
 */
jsObjDB.prototype.removeIndex = function (property) {
    if (!_.has(this.indexes, property)) {
        throw "Deleting a non-existent index (" + property + ")";
    }
    delete this.indexes[property];

};
/**
 * Insert a list of objects into the DB.
 * @example
 * var db = jsObjDB("a"); // Note that a is a primary key, and therefore required
 * db.insert([{a:1,b:2}, {a:2}, {c:3}]); // two elements get inserted. The third fails (requires 'a')
 *
 * @param   {Array}    items   An array of objects to be inserted into the DB
 * @param   {Function} cb      A callback function, called when the operation is complete. The callback
 *                           will be called using f({ type: "insert", inserted: inserted, failed: failed) where each is a cursor.
 *                           The inserted cursor will be bound to the DB, the failed cursor is not
 *                           bound to a DB.
 * @param   {Object}   binding The binding for this when calling the callback function
 * @returns {Object}   An object containing the operation type "insert" and the cursors: inserted, failed.
 */
jsObjDB.prototype.insert = function (items, cb, binding) {
    if (!jsObjDB.arrayOrCursor(items)) {
        throw "insert requires an array of objects";
    }
    var event = new DBEvent("insert", new Cursor(this), null, null, new Cursor());
    var len = items.length;
    for (var i = 0; i < len; i++) {
        try {
            this._insertOne(items[i]);
            event.inserted.push(items[i]);
        } catch (e) {
            event.failed.push(items[i]);
        }
    }
    //  Now do callback
    if (cb) {
        binding = binding || this;
        var f = _.bind(cb, binding);
        f(event);
    }
    //  Let our handlers know that something has happened
    this.callHandlers(event);
    return event;
};
/**
 * Insert a single object into the DB. Throws an exception on failure.
 * Returns the item on success with its _id set.
 * @param   {Object}   item    The object to be inserted into the DB.
 * @param   {Function} cb      Function to call after success (will be passed a full event descriptor)
 * @param   {Object}   binding The object to bind to this for the callback
 * @returns {Object}   The item inserted WITH _id now set.
 */
jsObjDB.prototype.insertOne = function (item, cb, binding) {
    if (jsObjDB.arrayOrCursor(item)) {
        throw "insertOne requires a single object";
    }
    this._insertOne(item);

    var event = new DBEvent("insert", new Cursor(this), null, null, new Cursor());
    event.inserted.push(item);
    //  Now do callback
    if (cb) {
        binding = binding || this;
        var f = _.bind(cb, binding);
        f(event);
    }
    //  Let our handlers know that something has happened
    this.callHandlers(event);
    return item;

};

/**
 * Insert a single item into the database.
 * Throws an exception on failure.
 * Any new item must not have an "_id" field.
 * (Permitting an ID field means that we might create a future problem. Imagine
 * have the current_id set 100, and we add an item with an _id of 110!. At some point
 * in the future we will have a key clash)
 * @private
 * @param {Object} item The object to insert in the DB.
 * @returns {Object} The item that was added to the DB, including its new _id field
 */
jsObjDB.prototype._insertOne = function (item) {
    //  If inserts have an _id - then it must be unique.
    if (_.has(item, "_id")) {
        throw "Cannot insert with _id field";
    }
    item._id = this.ref_id++;

    try {
        _.each(this.indexes, function (index, property) {
            index.addItem(item);
        }, this);
        //  If all index insertions work... we add to the store
        this.store[item._id] = item;
    } catch (e) {
        //  If any index insertion fails... we remove all index entries
        _.each(this.indexes, function (index, property) {
            index.removeItem(item);
        }, this);
        //  We also remove the entry itself
        delete this.store[item._id];
        throw e;
    }
    this._count++;
    return item;
}

/**
 * Run one Upsert. If the primary key already exists, then we convert
 * this to an update of that existing item. We simply merge the new item
 * onto the existing item. The existing items "_id" is kept, but for all other
 * properties, the new item has precendence.
 * <p>
 * It is possible that the insert or update will fail because it violates
 * some other key. In which case the original item is restored, and
 * an exception will be thrown. Note that failed is used here - either
 * the upsert works or an exception is thrown.
 * <p>
 * Items are searched for using the _id field (if present) or the primary key.
 * <p>
 * If an item was inserted, returns the item.
 * If an item was updated, returns null (you already have a way to find the item)
 * If the new item could not be inserted, throws
 * @example
 *
 * db.insertOne({a: 2});
 * db.upsertOne({a: 2, b: 3}); //   replaces the former object
 * var obj = db.findOne({a: 2});
 * obj.d = 7;
 * obj.a = 3;
 * db.upsert(obj);  // replaces {a: 2} object - uses the _id field for matching.
 * db.upsert({a:4});  // inserts a new object
 *
 * @param   {Object}   item    The item to be upserted.
 * @param   {Function} cb      Callback function to be called at the completion of the upsert.
 *                           Will be called with the item that was upserted.
 * @param   {Object}   binding Bound to this during the callback
 * @returns {Object}   The item that was upserted
 */
jsObjDB.prototype.upsertOne = function (item, cb, binding) {
    if (jsObjDB.arrayOrCursor(item)) {
        throw "UpsertOne requires a single object";
    }
    var ret = this._upsertOne(item);
    var type = ret[0];
    var item = ret[1];

    var event = new DBEvent("upsert", new Cursor(this), new Cursor(this), null, new Cursor());
    if (type === "insert") {
        event.inserted.push(item);
    } else {
        event.updated.push(item);
    }
    //  Now do callback
    if (cb) {
        binding = binding || this;
        var f = _.bind(cb, binding);
        f(event);
    }
    //  Let our Handlers know that something has happened
    this.callHandlers(event);
    return item;

}
/**
 * Upsert a set of items. See upsertOne for a spec on what happens to each item.
 * Upsert will always return a set of updated, inserted and failed cursors.
 *
 * @param   {Array}    items   Array of items to be upserted
 * @param   {Function} cb      Callback called on completion
 * @param   {Object}   binding Bound to this for callback.
 * @returns {Array}    List of inserted, updated and failed cursors. Note that the
 *                     failed cursor is not bound to a DB because the items dont
 *                     exist anywhere. They could not be inserted.
 */
jsObjDB.prototype.upsert = function (items, cb, binding) {
    if (!jsObjDB.arrayOrCursor(items)) {
        throw "Upsert requires an array of items";
    }
    var event = new DBEvent("upsert", new Cursor(this), new Cursor(this), null, new Cursor());
    var len = items.length;
    for (var i = 0; i < len; i++) {
        var item = items[i];
        try {
            var ret = this._upsertOne(item);
            var type = ret[0];
            item = ret[1];
            // TODO: there is confusion upsertOne returns item for insert and update.
            if (type === "insert") {
                event.inserted.push(item);
            } else {
                event.updated.push(item);
            }
        } catch (e) {
            event.failed.push(item);
            //console.log("Failure of upsert", e);
        }
    }
    //  Now do callback
    if (cb) {
        binding = binding || this;
        var f = _.bind(cb, binding);
        f(event);
    }
    //  Let our Handlers know that something has happened
    this.callHandlers(event);

    return event;
}
/**
 * Update an item in the database, using the _id, then primary key.
 * If this item doesn't exist... then the item is created.
 * <p>
 * If an item was inserted, returns the ["insert", item].
 * If an item was updated, returns the ["update", item].
 * If the new item could not be inserted, throws
 * @private
 * @param {Object} item Internal function to upsert a single object.
 *                      Will throw on failure to find an object.
 */
jsObjDB.prototype._upsertOne = function (item) {
    //  Watch for a clash on the primary key (if there is one)
    var old_item = undefined;
    //    console.log("***********STARTING UPSERT");
    if (_.has(item, "_id")) {
        //  If the item has an _id - use that to search...
        old_item = this.store[item._id];
    } else {
        // We will be using the primary key. So BOTH there must be a primary key on the DB, AND 
        // the item must have a primary key
        if (!this.prim_key || !_.has(item, this.prim_key)) {
            throw "Primary key on DB and item property is required for upserts (unless _id is provided)";
        }
        //  Find returns an array - although for a unique index the length is always 1 or zero.
        //        console.log("Searching ", this.prim_key, item[this.prim_key], this.indexes[this.prim_key].find(-1));
        var old_items = this.indexes[this.prim_key].find(item[this.prim_key]);
        //        console.log("Search found ", old_items);
        if (old_items) {
            if (old_items.length > 0) {
                old_item = old_items[0];
            }
        }
    }
    if (old_item) {
        var changeList = jsObjDB.parseChanges(item);
        //        console.log("update: old_item", old_item, item, changeList);
        return ["update", this._updateOne(old_item, changeList)];
    } else {
        //        console.log("insert: item", item);
        return ["insert", this._insertOne(item)];
    }
    //  Can't get to here...
};


/**
 * Update some values in the DB.
 * <p>
 * The query parameter chooses a set of objects to be updated.
 * <p>
 * The changes parameter specifies what changes are to be applied.
 * The changes object contains a set of "property" and "modifications" values.
 * <p>
 * Note that an update as a whole may cause index duplication while the update
 * is happening. For example: an int PK. You delete number 5, then move all 6-
 * elements down. During the move, 7 may get moved to 6 BEFORE 6 gets moved to 5.
 * So the update will fail.
 *
 * NOTE: if, when attempting to re-insert the item, and we get failed
 * indexes, then we UNDO all changes, reinsert the original, and throw.
 *
 * @example
 * var db = jsObjDB();
 * db.insertOne({a:1, b: {c: [1,2,3]}});
 * db.update({}, {a: { $inc: 1}, "b.c": { $push: 4 }});
 * db.find({ a: 2}); // returns: {a: 2, b: { c: [1, 2, 3, 4]}}
 *
 * @param   {Object}   query   A query selecting a group of objects to be modified
 * @param   {Object}   changes A set of operations to apply to those objects
 * @param   {Function} cb      A callback executed with the summary of changes.
 * @param   {Object}   binding Bound to this during callback
 * @returns {Array}    Returns two cursors - updated and failed.
 */
jsObjDB.prototype.update = function (query, changes, cb, binding) {
    var changeList = jsObjDB.parseChanges(changes);
    var set = this.find(query);
    var event = new DBEvent("update", null, new Cursor(this), null, new Cursor());
    var set_len = set.length;
    //    console.log("Update: set length", set.length, "Changees", changeList);
    for (var i = 0; i < set_len; i++) {
        var item = set [i];
        try {
            var ret = this._updateOne(item, changeList);
            event.updated.push(ret);
        } catch (e) {
            //            console.log("Failed update", e);
            event.failed.push(item);
        }
    }
    //  Now do callback
    if (cb) {
        binding = binding || this;
        var f = _.bind(cb, binding);
        f(event);
    }
    //  Let our handlers know that something has happened
    this.callHandlers(event);

    return event;
};

/**
 * Given an item, and a changeList, we modify that item.
 * We will before starting, remove it from all indexes.
 * We make the changes
 * We then attempt to reinsert the item into all indexes.
 * If we can't, we undo all changes and reinsert the original.
 * That is, on failure we undo everything.
 *
 * @private
 * @param {Object} item       The item to be updated
 * @param {Array}  changeList The compiled/parsed change set.
 * @returns {Object} The updated item. We throw on failure to insert.
 */
jsObjDB.prototype._updateOne = function (item, changeList) {
    var item_backup = _.cloneDeep(item);
    //  Remove them all from the indexes (except _id, which must not change)
    _.forOwn(this.indexes, function (idx) {
        //        console.log("_updateOne, idx", idx.property);
        idx.removeItem(item);
    }, this);
    //    console.log("Complete index removal");
    try {
        //        console.log("Updating...", item, changeList);
        jsObjDB.doChanges(item, changeList);
        //        console.log("After updating...", item);
    } catch (e) {
        //  Undo!
        //  TODO... what to do on failure of changes.
        //  Answer - reinsert backup into indexes.
        //        console.error("FAILED TO UPDATE", item, changeList);
    }
    try {
        //  Add the changed item back in to the indexes
        //        console.log("adding changed item back");
        _.forOwn(this.indexes, function (idx) {
            //            console.log("Adding into index ", idx.property);
            idx.addItem(item);
        }, this);
        //        console.log("Completed adding changed items back")
    } catch (e) {
        //  Failure on insertion. UNDO everything.
        //        console.log("Failure on insertion into indexes. Undoing.", e);
        //        console.log(this.toString());
        _.forOwn(this.indexes, function (idx) {
            idx.removeItem(item);
        }, this);
        //  Now reinsert the original
        this.store[item_backup._id] = item_backup;
        //this.indexes["_id"] = item_backup;
        //  Add them back in to the indexes
        _.forOwn(this.indexes, function (idx, key) {
            //            console.log("Readding to idx", key, idx.property, item_backup);
            idx.addItem(item_backup);
        }, this);
        throw "Update caused indexing failure";
    }
    //    console.log("Change", item_backup, item);
    return item;
}


/**
 * Delete a set of items from the database. Uses a query to select items.
 * @example
 * var db = jsObjDB();
 * ... // fill the database
 * db.delete({a: 4}, function(event) {
 *     console.log("Deleted %d items", event.deleted.length);
 *     event.deleted.each(function(item) { console.log(item); });
 * }, this);
 *
 * @param   {Object}   query   Query descriptor.
 * @param   {Function} cb      Callback function at the end of the deletion. Is passed the deleted set.
 * @param   {Object}   binding Bound to this during the callback
 * @returns {Object}   The cursor containing the deleted items. Not bound to a DB.
 */
jsObjDB.prototype.delete = function (query, cb, binding) {
    query = query || {};
    var deleted = this.find(query);
    var len = deleted.length;
    for (var i = 0; i < len; i++) {
        //        console.log("Deleting ", item, i, deleted.length);
        var item = deleted[i];
        delete this.store[item._id];
        //  Clean the indexes
        this._count--;
        _.forOwn(this.indexes, function (idx) {
            idx.removeItem(item);
        }, this);
    };
    var event = new DBEvent("delete", null, null, deleted, null);
        //  Now do callback
    if (cb) {
        binding = binding || this;
        var f = _.bind(cb, binding);
        f(event);
    }
    //  Let our handlers know that something has happened
    this.callHandlers(event);
    return event;
}
/**
 * Walk the given query array looking for the best index to use.
 * Specifically - we want the index that partitions the data the most, AND
 * we only support $eq, $in and $contains type queries.
 * We return the object representing the part of the query that has a useful index.
 * @private
 * @param   {Array}  qry Query array
 * @returns {Object} The query part that should be used first (has best index)
 */
jsObjDB.prototype._chooseIndex = function (qry) {
    var idx = _.max(qry, function (q) {
        // get the property name (first)
        var prop = q[0];
        //  Is this a direct comparison? If not... we can't use it.
        var op = q[1];
        if (op !== "$eq" && op !== "$in" && op !== "$contains") {
            return 0;
        }
        //  Is there an index for that property?
        var index = this.indexes[prop];
        //console.log("Inside Max. index ", index);
        if (index === undefined) {
            //            console.log("Inside Max", q, prop, "NO INDEX. partitions: 0");
            return 0;
        } else {
            //            console.log("Inside Max", q, prop, "Partitions:", index.partitions);
            return index.partitions;
        }
    }, this);
    var prop = idx[0];
    var op = idx[1]
    if (!_.has(this.indexes, prop)) {
        return null;
    }
    //  Its GOT to be only EQ or IN when using an index
    if (op !== "$eq" && op !== "$in" && op !== "$contains") {
        return null;
    }
    return idx;

}
/**
 * Return the number of elements held in the jsObjDB, or number
 * of elements in a query set.
 * <p>
 * We *do NOT* provide a length because we dont want jsObjDB mistaken for
 * an array - IT IS NOT. Its store can have holes, and there are no user accessible
 * integer semantics for access.
 * @example
 * var itemCount = db.count();  //  return count of all items (note: this will be very fast)
 * var itemCount = db.count({});  //  also return count of all items (note: this will be very fast)
 * var itemCount = db.count({a: 1}); // return count of items with a == 1;
 * var itemCount = db.count({a: { $gt: 3 }}); // return count of items with a > 3;
 
 * @param   {Object} query Set to count
 * @returns {Number} Number of items in the set (if query is blank, returns total count)
 */
jsObjDB.prototype.count = function (query) {
    if (!query || query === {}) {
        //  Quick exit - want the total number of elements held.
        return this._count;
    }
    query = query || {};
    var set = this.find(query);
    return set.length;
}
/**
 * Find matching objects from the DB. Query is used as a selector.
 * <p>
 * If a callback is provided, it is called with a cursor representing the found
 * items. That same cursor is also returned and can be used in chained calls.
 *
 * @example
 * var cursor = db.find({a: { $ge: 5 }});
 * console.log(cursor.length);  //  prints the number of elements with a >= 5
 * var cursor = db.find({b: 5}).sort("c").uniq("c");
 * // cursor now contains all elements with b == 5, sorted on 'c' with duplicates removed.
 *
 * @param   {Object}   query   Description of the search criteria
 * @param   {Function} cb      Callback function with a cursor object representing the results
 * @param   {Object}   binding Bound to this during callback
 * @returns {Object}   Cursor containing all elements matching the query.
 */
jsObjDB.prototype.find = function (query, cb, binding) {
    query = query || {};
    var matches = this.store;
    var _this = this;
    var qry = jsObjDB.parseQuery(query);
    //  Find the best index
    var idx = this._chooseIndex(qry);
    //    console.log(idx, qry);
    if (idx) {
        //  There IS an index to use... Remove it from the query.
        qry = _.without(qry, idx);
        var prop = idx[0],
            op = idx[1],
            value = idx[2];
        //  Get the list that matches according to the index.
        //        console.log("Find: prop", prop, _.has(this.indexes, prop), typeof this.indexes[prop])
        if (op === "$eq" || op === "$contains") {
            matches = this.indexes[prop].find(value);
        } else if (op === "$in") {
            //  Merge all the individual sets together.
            matches = _.reduce(value, function (coll, v) {
                coll = _.union(coll, this.indexes[prop].find(v));
                return coll;
            }, [], this);
        } else {
            throw "Invalid op index type";
        }
    }
    //  Continue the search
    matches = _.filter(matches, function (item) {
        return jsObjDB.doQueryMatching(item, qry);
    }, this);

    var cursor = new Cursor(this, matches);
    //  Now do callback
    if (cb) {
        binding = binding || this;
        var f = _.bind(cb, binding);
        f(cursor);
    }
    return cursor;
};

/**
 * Find the first item that matches, and return it.
 * NOTE that we DO NOT return a cursor, but an item.
 * The CB also gets the ITEM. This cannot be changed.
 * @param   {Object}   query The query object
 * @param   {Function} cb    Callback
 * @returns {Object}   The matching item
 */
jsObjDB.prototype.findOne = function (query, cb, binding) {
    var matches = this.store;
    var qry = jsObjDB.parseQuery(query);
    //  Find the best index
    var idx = this._chooseIndex(qry);
    if (idx) {
        //        console.log("Using Index", idx)
        //  There IS an index to use... Remove it from the query.
        qry = _.without(qry, idx);
        var prop = idx[0],
            op = idx[1],
            value = idx[2];
        //  Get the list that matches according to the index.
        if (op === "$eq" || op === "$contains") {
            matches = this.indexes[prop].find(value);
        } else if (op === "$in") {
            matches = _.reduce(value, function (coll, value) {
                coll = _.union(coll, this.indexes[prop].find(value));
            }, [], this);
        } else {
            throw "Invalid op index type";
        }
        //        console.log("Found matches", matches.length);
    }
    //  Continue the search
    if (qry.length > 0) {
        //        console.log("Continuing search...");
        //  Note that matches MUST be n array, whereas find returns the first. So force it
        //  to be an array (even if its empty)
        var m = _.find(matches, function (item) {
            var ret = jsObjDB.doQueryMatching(item, qry);
            //        console.log("Match ", item, qry, "Result:", ret);
            return ret;
        }, this);
        if (m === undefined) {
            matches = []
        } else {
            matches = [m];
        }

    }
    //    console.log("Matches", matches);
    var match = null;;
    if (matches && matches.length > 0) {
        //        console.log("matches", matches);
        match = matches[0]
    }
    //  Now do callback
    if (cb) {
        binding = binding || this;
        var f = _.bind(cb, binding);
        f(match);
    }
    //    console.log("FindOne, return", match);
    return match;
};
/**
 * Find all elements using a custom test function. The function is passed each object in turn, and
 * should return true on a successful test. If a binding parameter is used, it will be bound to 'this'
 * during function invocation. Otherwise the jsObjDB is bound.
 * @example
 * var cursor = db.findWhere(function(item) { return item.a > 5; });
 *
 * @param   {Function} cb             Callback for testing inclusion
 * @param   {Object}   [binding=this] Context for the callback function
 * @returns {Cursor}   A cursor containing all found items
 */
jsObjDB.prototype.findWhere = function (cb, binding) {
    if (!cb) {
        throw "Test function is required"
    }
    binding = binding || this;
    var testFn = _.bind(cb, binding);
    var cursor = new Cursor(this, _.filter(this.store, testFn));
    return cursor;
}

/**
 * Returns true if there exists at least ONE item that matches the query
 * @example
 * var db = jsObjDB("a");
 * ...  // fill the database up
 * if (db.exists({a: { $lt: 5 }})) {
 *     //   come here if any objects have a < 5.
 * }
 * @param   {Object}  qry Query
 * @returns {Boolean} True if there exists at least one match, false otherwise.
 */
jsObjDB.prototype.exists = function (qry) {
    return this.findOne(qry) !== null;
}

/**
 * A static utility function that takes a query and converts it into a usable internal form:
 *   [ [ "property", "op", value ], ...]
 * @static
 * @private
 * @param   {Object} query The query object, in the form {prop: value. ...}, or { prop: {$op: value}, ...}
 * @returns {Array}  The query parsed into an array of [[prop $op value],...]
 */
jsObjDB.parseQuery = function (query) {
    var list = [];
    _.forOwn(query, function (value, key) {
        if (typeof value === 'object') {
            //  The value is a more complex operator...
            _.forOwn(value, function (v, op) {
                list.push([key, op, v]);
            });

        } else {
            list.push([key, '$eq', value]);
        }
    });
    return list;
};

/**
 * A static utility function that takes a change object and converts it into the form:
 *   [ [ "property", "op", value ], ...]
 * @static
 * @private
 * @param   {Object} changes A set of object changes, in the form {prop: value, prop { $op: value }}
 * @returns {Array}  The changes converted to an array [[prop $op value], ...]
 */
jsObjDB.parseChanges = function (query) {
    var list = [];
    _.forOwn(query, function (value, key) {
        if (typeof value === 'object') {
            //  The value is a more complex operator...
            _.forOwn(value, function (v, op) {
                list.push([key, op, v]);
            });

        } else {
            list.push([key, '$set', value]);
        }
    });
    return list;
};


/**
 * Execute a set of changes on an object.
 * The changes will be provided in the form of a list of [["property", "op", "value], ...]
 * as created by parseChanges.
 *
 * @static
 * @private
 * @param {Object} item       Object to be changed
 * @param {Array}  changeList A list of changes to be applied to the object
 */
jsObjDB.doChanges = function (item, changeList) {
    //  For each change... execute it.
    _.each(changeList, function (change) {
        //  Apply this one change to the item
        var prop = change[0],
            op = change[1],
            value = change[2];
        switch (op) {
        case "$set":
            item[prop] = value;
            break;
        case "$inc":
            item[prop] = _.has(item, prop) ? item[prop] + value : value;
            break;
        case "$dec":
            item[prop] = _.has(item, prop) ? item[prop] - value : -value;
            break;
        case "$push":
            if (!_.has(item, prop)) {
                item[prop] = [];
            } else {
                //  Does have the property... check its the right type
                if (!_.isArray(item[prop])) {
                    throw "Object is not an array. " + item._ref;
                }
            }
            item[prop].push(value);
            break;
        case "$concat":
            if (!_.has(item, prop)) {
                item[prop] = [];
            } else {
                //  Does have the property... check its the right type
                if (!_.isArray(item[prop])) {
                    throw "Object is not an array. " + item._ref;
                }
            }
            if (!_.isArray(value)) {
                throw "Value is not an array. " + value;
            }
            item[prop] = item[prop].concat(value);
            break;
        case "$setadd":
            if (!_.has(item, prop)) {
                item[prop] = [];
            } else {
                //  Does have the property... check its the right type
                if (!_.isArray(item[prop])) {
                    throw "Object is not an array. " + item._ref;
                }
            }
            item[prop] = _.union(item[prop], [value]);
            break;
        case "$pop":
            if (!_.has(item, prop)) {
                item[prop] = [];
            } else {
                //  Does have the property... check its the right type
                if (!_.isArray(item[prop])) {
                    throw "Object is not an array. " + item._ref;
                }
            }
            if (value > 0) {
                item[prop] = _.initial(item[prop], value);
            } else {
                item[prop] = _.rest(item[prop], -value);
            }
            break;
        case "$pull":
            if (!_.has(item, prop)) {
                item[prop] = [];
            } else {
                //  Does have the property... check its the right type
                if (!_.isArray(item[prop])) {
                    throw "Object is not an array. " + item._ref;
                }
            }
            if (_.isArray(value)) {
                //  An array... remove them all
                item[prop] = _.difference(item[prop], value);
            } else {
                //  A value... pull that value from the array.
                _.pull(item[prop], value);
            }
            break;
        default:
            throw "Back operator in update: " + op;
        }
    });
};

/**
 * Return true if the given object is an Array or Cursor.
 * Note that this differs from lodash/underscore implementation in that
 * it correctly returns true for a Cursor.
 *
 * @private
 * @static
 * @param   {Object}  obj The object to be tested for being an array or Cursor
 * @returns {Boolean} True if the object is an array or Cursor.
 */
jsObjDB.arrayOrCursor = function (obj) {
    return obj && typeof obj.length == 'number';
};


/**
 * Given an Object and a property name, return the value.
 * Supports sub-objects (a.b) and arrays (a[3]) and any combination
 * thereof (a[3].b[2].c). Will return "undefined" if the item does not exist.
 * Note that this can be used to parse a property string on any property,
 * not just database ones.
 *
 * @private
 * @static
 * @param   {Object} item     The Object to be queries
 * @param   {String} property The name or path to the the property
 * @returns {Value}  The value of the property, or undefined
 */
jsObjDB.getPropertyValue = function (item, property) {
    if (!item || !property) {
        return undefined;
    }
    //  Split the property name into its sub-accessor parts.
    var parts = property.split(".");
    var item_value = item;
    var parts_len = parts.length;
    //  Walk the list of accessors/subaccessors, using item_value to keep track.
    for (var i = 0; i < parts_len; i++) {
        if (item_value === undefined) {
            //                console.log("item_value is undefined. ");
            return undefined;
        }
        //  Part is the name of a property accessor
        var part = parts[i];
        //  If the name is actually an array index... 
        var re = /([a-z0-9_]+)\[([a-z0-9_]+)\]/;
        var ret = re.exec(part);
        if (ret != null) {
            //                console.log("Array Match", re, ret);
            //  get the name and index
            var arr_name = ret[1];
            var idx = ret[2];
            if (!_.has(item_value, arr_name)) {
                return undefined;
            }
            if (!_.isArray(item_value[arr_name])) {
                return undefined;
            }
            //                console.log("Pulling apart array", item_value, arr_name, idx, item_value[arr_name][idx]);
            item_value = item_value[arr_name][idx];

        } else {
            //  If the part doesn't have the property... fail
            if (!_.has(item_value, part)) {
                //                    if (debug) {
                //                        console.log("item doesn't have part", item_value, part)
                //                    }
                return undefined;
            }
            item_value = item_value[part];
        }
        //            if (debug) {
        //                console.log("Loop", item_value, part, prop, parts, i);
        //            }
    }
    return item_value;
}
/**
 * Given a data item, and a parsed query array...
 * figure out whether the item matches all parts of the query
 *
 * @static
 * @private
 * @param   {Object}  item Data item being examined
 * @param   {Array}   qry  Parsed query object. In the form [[prop, op, value], ...]
 * @returns {Boolean} True if the object matches the query
 */
jsObjDB.doQueryMatching = function (item, qry) {
    if (qry.length === 0) {
        return true;
    }
    return _.every(qry, function (qry_part) {
        var prop = qry_part[0],
            op = qry_part[1],
            value = qry_part[2];
        var item_value = jsObjDB.getPropertyValue(item, prop);
        if (item_value === undefined) {
            return false;
        }
        switch (op) {
        case '$eq':
            return item_value === value;
        case '$ne':
            return item_value !== value;
        case '$lt':
            return item_value < value;
        case '$gt':
            return item_value > value;
        case '$le':
            return item_value <= value;
        case '$ge':
            return item_value >= value;
        case '$in':
            if (!_.isArray(value)) {
                throw "Must provide array for in operator";
            }
            return value.indexOf(item_value) >= 0;
        case '$nin':
            if (!_.isArray(value)) {
                throw "Must provide array for nin operator";
            }
            return value.indexOf(item_value) === -1;
        case "$match":
            return new RegExp(value).test(item_value);
        case "$contains":
            if (!_.isArray(item_value))
                throw "Contains operator only for arrays";
            return item_value.indexOf(value) >= 0;
        default:
            return false;
        }
    }, this);

};
/**
 * Walks an object and its children, calculating the approximate total space used.
 * Note that this is approximate.
 *
 * @private
 * @static
 * @param   {Object} object The object to be analysed
 * @returns {Number} Size of the object, in bytes
 */
jsObjDB.sizeOfObject = function (object) {

    // initialise the list of objects and size
    var objects = [object];
    var size = 0;

    // loop over the objects
    for (var index = 0; index < objects.length; index++) {
        var obj = objects[index];

        // determine the type of the object
        switch (typeof obj) {

            // the object is a boolean
        case 'boolean':
            size += 4;
            break;

            // the object is a number
        case 'number':
            size += 8;
            break;

            // the object is a string
        case 'string':
            size += 2 * obj.length;
            break;

            // the object is a generic object
        case 'object':
            if (obj && typeof obj.sizeof === 'function') {
                size += obj.sizeof();
            } else {
                // if the object is not an array, add the sizes of the keys
                if (Object.prototype.toString.call(obj) != '[object Array]') {
                    for (var key in obj) size += 2 * key.length;
                }
                // loop over the keys
                for (var key in obj) {

                    // determine whether the value has already been processed
                    var processed = false;
                    for (var search = 0; search < objects.length; search++) {
                        if (objects[search] === objects[index][key]) {
                            processed = true;
                            break;
                        }
                    }
                    // queue the value to be processed if appropriate
                    if (!processed) objects.push(obj[key]);
                }
            }
        }
    }

    // return the calculated size
    return size;

}

if (is_node) {
    module.exports = jsObjDB;
}