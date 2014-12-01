/*jslint node: true */ //  Permit file level "use strict"
/*jslint nomen: true */ //  Permit leading "_" character
/*jslint todo: true */ //  Permit TODO

"use strict";

//  Set to false if we are not using node
var is_node = (typeof module !== 'undefined' && module.exports);
//  Uncomment this line if running in node.js
if (is_node) {
    var _ = require("../lib/lo-dash.min.js");
    var test = require("./unittest.js");
    var jsObjDB = require("./jsobjdb.js");
}


/* Test code */
var DBTestIndexes = function () {}
if (is_node) {
    DBTestIndexes.prototype = new test.TestCase();
} else {
    DBTestIndexes.prototype = new TestCase();
}
DBTestIndexes.prototype.setUp = function () {
    this.db = new jsObjDB();
    this.db.addIndex("a");
    this.db.addIndex("b");
    this.db.addIndex("c");
    this.db.addIndex("d");
    this.db.addIndex("u", true);
}
DBTestIndexes.prototype.tearDown = function () {
    delete this.db;
}
DBTestIndexes.prototype.testAddIndex = function () {
    this.assertThrows(function () {
        this.db.addIndex("a");
    });
    this.db.addIndex("z");
};
DBTestIndexes.prototype.testRemoveIndex = function () {
    this.assertThrows(function () {
        this.db.removeIndex("v");
    })
    this.db.removeIndex("a");
    this.assertThrows(function () {
        this.db.removeIndex("a");
    })
}
DBTestIndexes.prototype.testUnique = function () {
    this.db.insertOne({
        a: 1,
        b: 2,
        u: 1
    });

    this.assertThrows(function () {
        this.db.insertOne({
            a: 1,
            b: 2,
            u: 1
        });
    }, "insertOne didn't throw on dup");
    var ret = this.db.insert(
        [{
            a: 1,
            b: 2,
            u: 1
        }, {
            a: 1,
            b: 2,
            u: 1
    }]);
    this.assertEqual(ret.inserted.length, 0, "Should have had 0 successes");
    this.assertEqual(ret.failed.length, 2, "Should have had 2 failures");

    //this.db.insertOne([])

};

var DBTestData = function () {}
if (is_node) {
    DBTestData.prototype = new test.TestCase();
} else {
    DBTestData.prototype = new TestCase();
}

DBTestData.prototype.setUp = function () {
    this.db = new jsObjDB();
    this.db.addIndex("u", true);
    this.db.addIndex("a");
    this.db.addIndex("b");
    this.db.addIndex("f.a");
    this.db.addIndex("f.c[1]");
    this.db.addIndex("f.c");

    //  Insert a lot of objects, randomly arranged
    this.iterate(function (iter) {
        var obj = {
            a: Math.floor(Math.random() * 5),
            b: Math.floor(Math.random() * 20),
            c: Math.floor(Math.random() * 50),
            d: Math.floor(Math.random() * 200),
            f: {
                a: Math.floor(Math.random() * 200),
                b: Math.floor(Math.random() * 200),
                c: [Math.floor(Math.random() * 20), Math.floor(Math.random() * 20), Math.floor(Math.random() * 20)],
                u: Math.floor(iter)
            },
            g: [Math.floor(Math.random() * 20), Math.floor(Math.random() * 20), Math.floor(Math.random() * 20)],
            arr: [],
            u: Math.floor(iter),
        }
        this.db.insertOne(obj);
    }, 1000);
};
DBTestData.prototype.tearDown = function () {
    delete this.db;
};


DBTestData.prototype.testLargeInsert = function () {
    //  Create a local DB for a large insertion test.
    var db = new jsObjDB();
    db.addIndex("a");
    db.addIndex("b");
    db.addIndex("u", true);

    this.time("Add Many Objects - 3 indexes", function (iter) {
        var obj = {
            a: Math.floor(Math.random() * 5),
            b: Math.floor(Math.random() * 20),
            c: Math.floor(Math.random() * 100),
            d: Math.floor(Math.random() * 1000),
            u: Math.floor(iter),

        }
        db.insertOne(obj);

    }, 10000);
    this.assertEqual(db.count(), 10000, "Didn't add all objects for 3 index test");

    var db = new jsObjDB();
    db.addIndex("a");
    db.addIndex("b");
    db.addIndex("c");
    db.addIndex("d");
    db.addIndex("e");
    db.addIndex("u", true);

    this.time("Add Many Objects - 6 indexes", function (iter) {
        var obj = {
            a: Math.floor(Math.random() * 5),
            b: Math.floor(Math.random() * 20),
            c: Math.floor(Math.random() * 100),
            d: Math.floor(Math.random() * 1000),
            e: Math.floor(Math.random() * 2000),
            u: Math.floor(iter),

        }
        db.insertOne(obj);

    }, 10000);
    this.assertEqual(db.count(), 10000, "Didn't add all objects for 6 index test");

};
DBTestData.prototype.testFindOneUniqueIndex = function () {
    var item = this.db.findOne({
        u: 7
    });
    this.assertTrue(item, "Unable to findOne using unique index");
    this.assertTrue(item.u === 7, "Find returned the wrong element");

    //  Now time how long it takes to find each of the items using the unique index
    this.time("Find using unique index", function (iter) {
        //        console.log("Finding iter=", iter);
        var item = this.db.findOne({
            u: iter
        });
        this.assertTrue(item, "Iter item was found");

        this.assertEqual(item.u, iter, "Iter item found, but was wrong");
    }, 1000);
};
DBTestData.prototype.testFindOneIndex = function () {
    var item = this.db.findOne({
        a: 4,
        b: 7
    });
    this.assertTrue(item, "Unable to findOne using non-unique index");
    this.assertTrue(item.a === 4);
    this.assertTrue(item.b === 7);

    //  Now time how long it takes to find each of the items using the unique index
    this.time("Find using non-unique index", function (iter) {
        //        console.log("Finding iter=", iter);
        var item = this.db.findOne({
            a: 4,
            b: 7
        });
        //        console.log("found", item);
        if (item === null) {
            throw "Unable to find " + iter;
        }

        this.assertEqual(item.a, 4);
        this.assertEqual(item.b, 7);
    }, 1000);

}

DBTestData.prototype.testFindNoIndex = function () {
    //  Now time how long it takes to find each of the items using the unique index
    var cursor = this.db.find({
        c: 20
    });
    this.assertTrue(cursor.length > 0, "Length is zero");
    //  Check how many there actually are
    var len = _.filter(this.db.store, function (item) {
        return item.c === 20;
    }).length;
    this.assertEqual(cursor.length, len);
    _.each(cursor, function (item) {
        this.assertEqual(item.c, 20);
    }, this);

    this.time("Find all no index", function (iter) {
        //        console.log("Finding iter=", iter);
        var cursor = this.db.find({
            c: 20
        });
    }, 10);
}
DBTestData.prototype.testFindIndex = function () {
    //  Now time how long it takes to find each of the items using the unique index
    var cursor = this.db.find({
        a: 1,
        b: 2
    });
    this.assertTrue(cursor.length > 0);
    //  Check how many there actually are
    var len = _.filter(this.db.store, function (item) {
        return item.a === 1 && item.b === 2;
    }).length;
    this.assertEqual(cursor.length, len);
    _.each(cursor, function (item) {
        this.assertEqual(item.a, 1);
        this.assertEqual(item.b, 2);
    }, this);

    this.time("Find all using non-unique index", function (iter) {
        //        console.log("Finding iter=", iter);
        var cursor = this.db.find({
            a: 3,
            b: 2
        });
    }, 1000);
}
DBTestData.prototype.testFindUniqueIndex = function () {
    //  Now time how long it takes to find each of the items using the unique index
    var cursor = this.db.find({
        u: 2
    });
    this.assertTrue(cursor.length === 1);

    this.time("Find all using unique index", function (iter) {
        //        console.log("Finding iter=", iter);
        var cursor = this.db.find({
            u: iter
        });
    }, 1000);
}
DBTestData.prototype.testFindOneFailures = function () {
    var ret = this.db.findOne({
        u: 1,
        a: -1000
    });
    this.assertEqual(ret, null, "FindOne, dual search criteria should have failed");
}

DBTestData.prototype.testChaining = function () {

    var items = this.db.find({
        b: 1
    }).sort("a").filter({
        c: {
            $lt: 5
        }
    }).uniq("b");
    this.assertEqual(items.length, 1);
    this.assertEqual(items[0].b, 1);
    this.assertTrue(items[0].c < 5);
}
DBTestData.prototype.testDeleteChaining = function () {
    var count = this.db.find({
        b: 1
    }).length;
    var check_count = 0;
    var info = this.db.delete({
        b: 1
    }).deleted.each(function () {
        check_count += 1;
    });
    this.assertEqual(count, check_count, "Number deleted not same as find")

}
DBTestData.prototype.testInOp = function () {
    var items = this.db.find({
        b: {
            $in: [1, 2, 3]
        }
    });

    var len = _.filter(this.db.store, function (item) {
        return item.b === 1 || item.b === 2 || item.b === 3;
    }).length;
    this.assertEqual(items.length, len);
}
DBTestData.prototype.testJoin = function () {
    var db = new jsObjDB();
    db.insertOne({
        f: 3,
        g: 5,
        d: 940,
        a: -1
    });
    var ret = db.find({}).join(this.db, "d");

    //  Check how many from this.db have d == 940.
    var num = this.db.find({
        d: 940
    }).length;
    this.assertEqual(ret.length, num);
    //    console.log(ret);
}
DBTestData.prototype.testJoin2 = function () {
    var db = new jsObjDB();
    db.insert([{
        a: 1,
        b: 1,
        c: 1,
        e: 1
    }, {
        a: 2,
        b: 2,
        c: 2,
        e: 2
    }, {
        a: 3,
        b: 3,
        c: 3,
        e: 3
    }]);
    var db2 = new jsObjDB();
    db2.insert([{
        d: 1,
        e: 1,
        f: 1
    }, {
        d: 2,
        e: 2,
        f: 2
    }, {
        d: 3,
        e: 3,
        f: 3
    }]);

    var cursor = db.find({}).join(db2, "d", "$lt", "a");
    _.each(cursor, function (item) {
        this.assertTrue(item.d < item.a, "Item is d is not less than a")
    }, this);
}
DBTestData.prototype.testUpdate = function () {
    var num = this.db.find({
        d: 100
    }).length;
    this.db.update({
        d: 100
    }, {
        d: -5
    });
    this.assertEqual(this.db.find({
        d: 100
    }).length, 0, "Not all old elements were removed");
    this.assertEqual(this.db.find({
        d: -5
    }).length, num, "Not all new elements were inserted");
}
DBTestData.prototype.testDeleteSmall = function () {
    var db = new jsObjDB();
    db.insertOne({
        a: 1
    });
    var data = db.delete({});
    var data = this.db.delete({});
}

DBTestData.prototype.testDelete = function () {
    var obj = {
        a: -50,
        b: -50,
        u: -50
    }
    var c = this.db.insertOne(obj);
    this.assertTrue(_.has(c, "_id"), "_id didn't get set");
    var id = c._id;

    this.assertTrue(this.db.find({
        b: -50
    }).length > 0, "Value didn't get inserted into index");
    this.db.delete({
        b: -50
    });
    this.assertEqual(this.db.find({
        b: -50
    }).length, 0, "Found item after delete");

    //  Check the indexes are cleaned
    this.assertEqual(this.db.indexes['b'].values[-50], undefined, "Value didn't get removed from index");

    var len = this.db.count();
    for (var i = -200; i < -100; i++) {
        var obj = {
            a: i,
            b: i,
            u: i
        };
        this.db.insertOne(obj);
    }
    this.assertEqual(this.db.count(), len + 100, "Failed first block insert"); //  100 new items
    for (var i = -200; i < -100; i++) {
        this.db.delete({
            u: i
        });
    }
    this.assertEqual(this.db.count(), len, "Failed first delete"); // Back to original number

    //  Add them back in
    for (var i = -200; i < -100; i++) {
        var obj = {
            a: i,
            b: i,
            u: i
        };
        this.db.insertOne(obj);
    }
    //  Delete them all again
    var ret = this.db.delete({
        a: {
            $lt: -99
        }
    });
    this.assertEqual(ret.deleted.length, 100, "Failed second delete (num deleted wrong)");
    this.assertEqual(this.db.count(), len, "Failed second delete (num left wrong)"); // Back to original number
    this.time("Delete all, add all " + this.db.count(), function () {
        var l = this.db.count();
        var ret = this.db.delete({});
        this.assertEqual(this.db.find({}).length, 0, "Should be empty");
        this.assertEqual(ret.deleted.length, l, "Deleted items were not all returned in the cursor");
        //  Get rid of all _id fields
        _.each(ret.deleted, function (item) {
            delete item._id;
        });
        this.db.insert(ret.deleted);
        this.assertEqual(this.db.count(), l, "Items should all be back");
    }, 10);
}
DBTestData.prototype.testFindCallbacks = function () {
    var cursor = this.db.find({
        a: 1
    });
    this.db.find({
        a: 1
    }, function (c) {
        this.assertEqual(cursor.length, c.length);
        _.each(c, function (item) {
            this.assertEqual(item.a, 1);
        }, this);
    }, this);
};
DBTestData.prototype.testUpdateCallbacks = function () {
    var cursor = this.db.find({
        a: 1
    });
    this.db.update({
        a: 1
    }, {
        a: -1
    }, function (info) {
        this.assertEqual(cursor.length, info.updated.length, "Not all items were updated (success length wrong)");
        for (var i = 0; i < info.updated.length; i++) {
            var item = info.updated[i];
            //            console.log("After update: ", item);
            this.assertEqual(item.a, -1, "Incorrect update");
        }
        this.assertEqual(info.failed.length, 0, "Some items failed updated");
    }, this);
};
DBTestData.prototype.testInsertFailures = function () {
    //  Insert a bunch of data where some will fail
    var data = [
        {
            a: 1,
            u: 5
        }, {
            a: 1,
            u: 6
        }, {
            a: 1,
            u: 7
        },
        {
            a: 1,
            u: 5
        }, {
            a: 1,
            u: 6
        }, {
            a: 1,
            u: 7
        },
        {
            a: 1,
            u: 5
        }, {
            a: 1,
            u: 6
        }, {
            a: 1,
            u: 7
        },
        {
            a: 1,
            u: 5
        }, {
            a: 1,
            u: 6
        }, {
            a: 1,
            u: 7
        },
        {
            a: 1,
            u: -5
        }, {
            a: 1,
            u: -6
        }, {
            a: 1,
            u: -7
        }
    ];
    var ret = this.db.insert(data, function (info) {
        this.assertEqual(info.inserted.length, 3);
        this.assertEqual(info.failed.length, 12);
    }, this);
    this.assertEqual(ret.inserted.length, 3);
    this.assertEqual(ret.failed.length, 12);
}
DBTestData.prototype.testDeleteCallbacks = function () {
    var cursor = this.db.find({
        a: 1
    });
    this.db.delete({
        a: 1
    }, function (c) {
        this.assertEqual(cursor.length, c.deleted.length);
        _.each(c.deleted, function (item) {
            this.assertEqual(item.a, 1);
            //   Check that item does not exist in the DB
            this.assertEqual(this.db.find({
                _id: item._id
            }).length, 0);
        }, this);
    }, this);
    this.assertEqual(this.db.find({
        a: 1
    }).sort("b").length, 0);
};

DBTestData.prototype.testUpdateOperators = function () {
    //  DEC
    var value = this.db.findOne({
        u: 1
    }).a;
    this.db.update({
        u: 1
    }, {
        a: {
            $dec: 5
        }
    });
    this.assertEqual(this.db.findOne({
        u: 1
    }).a, value - 5, "Dec");

    //  INC
    this.db.update({
        u: 1
    }, {
        a: {
            $inc: 5
        }
    });
    this.assertEqual(this.db.findOne({
        u: 1
    }).a, value, "Inc");

    //  Push
    this.db.update({
        u: 1
    }, {
        arr: {
            $push: 5
        }
    });
    this.assertEqual(this.db.findOne({
        u: 1
    }).arr, [5], "Push");

    //  Concat
    this.db.update({
        u: 1
    }, {
        arr: {
            $concat: [5, 6, 7]
        }
    });
    this.assertEqual(this.db.findOne({
        u: 1
    }).arr, [5, 5, 6, 7], "Concat");

    this.assertNotEqual(this.db.findOne({
        u: 1
    }).arr, [5, 6, 7], "Concat");

    //  SetAdd
    this.db.update({
        u: 1
    }, {
        arr: {
            $set: [5]
        }
    });
    this.db.update({
        u: 1
    }, {
        arr: {
            $setadd: 5
        }
    });
    this.db.update({
        u: 1
    }, {
        arr: {
            $setadd: 6
        }
    });
    this.db.update({
        u: 1
    }, {
        arr: {
            $setadd: 7
        }
    });
    this.db.update({
        u: 1
    }, {
        arr: {
            $setadd: 5
        }
    });
    this.db.update({
        u: 1
    }, {
        arr: {
            $setadd: 8
        }
    });
    this.assertEqual(this.db.findOne({
        u: 1
    }).arr, [5, 6, 7, 8], "SetAdd");

    //  Pop
    this.db.update({
        u: 1
    }, {
        arr: {
            $pop: 2
        }
    });

    //  Pop
    this.db.update({
        u: 1
    }, {
        arr: {
            $pop: -1
        }
    });
    //  two from the end, one from the start
    this.assertEqual(this.db.findOne({
        u: 1
    }).arr, [6], "Pop");

    //  Pull
    this.db.update({
        u: 1
    }, {
        arr: {
            $concat: [7, 8, 9, 10, 11, 12, 8, 9, 10]
        }
    });
    this.db.update({
        u: 1
    }, {
        arr: {
            $pull: [7, 8]
        }
    });
    this.db.update({
        u: 1
    }, {
        arr: {
            $pull: 9
        }
    });
    //  two from the end, one from the start
    this.assertEqual(this.db.findOne({
        u: 1
    }).arr, [6, 10, 11, 12, 10], "Pull");

    var ret = this.db.insertOne({
        a: 1,
        u: -1000,
        x: "Tuesday"
    });
    this.assertNotEqual(ret, undefined, "Unable to insert Tuesday");
    var item = this.db.findOne({
        x: {
            $match: "^T[ue]+.*y$"
        }
    });
    this.assertNotEqual(item, undefined, "Failed find");
    this.assertEqual(item.u, -1000, "No regexp match");
}

DBTestData.prototype.testDelegates = function () {
    var size = 1000;
    var called = false;
    this.db.addDelegate(1234, function (event) {
        if (event.type === "insert") {
            //            console.log("insert event len", event.inserted.length);
            this.assertEqual(event.inserted.length, size);
        } else if (event.type === "update") {
            //            console.log("update event len", event.updated.length);
            _.each(event.inserted, function (item) {
                this.assertEqual(item.b, 5);
            }, this);
            _.each(event.updated, function (item) {
                this.assertEqual(item.b, 5);
            }, this);
            //  Should be no failures
            this.assertEqual(event.failed.length, 0);
        } else if (event === "delete") {
            //            console.log("delete event len", event.deleted.length);
            this.assertEqual(event.deleted.length, size);
        }
        //  Put this at the end... so any exception above means called fails.
        called = true;
    }, this);
    var arr = [];
    for (var i = 0; i < size; i++)
        arr.push({
            a: -999
        });
    this.db.insert(arr);
    this.assertTrue(called, "the insert delegate did not get called");

    called = false;
    this.db.update({
        a: -999
    }, {
        b: 5
    });
    this.assertTrue(called, "the update delegate did not get called");

    called = false;
    this.db.delete({
        a: -999
    });
    this.assertTrue(called, "the delete delegate did not get called");
}
DBTestData.prototype.testDelegates2 = function () {
    var calls = 0;
    this.db.addDelegate(1234, function (event, success, failures) {
        calls += 1;
    });
    this.db.addDelegate(1235, function (event, success, failures) {
        calls += 1;
    });
    this.db.insertOne({
        a: -1,
        u: -1
    });
    this.db.update({
        u: -1
    }, {
        a: 2
    });
    //  ALL Delegates should be called, even when one of them throws.   
    this.assertEqual(calls, 4);
}

DBTestData.prototype.testFailInsert = function () {
    var objs = [{
        a: -1,
        b: -2,
        u: -3
    }, {
        a: -2,
        b: -2,
        u: -3
    }]
    this.db.insert(objs, function (info) {
        this.assertEqual(info.inserted.length, 1);
        this.assertEqual(info.failed.length, 1);
    }, this);
    //  Check that our entry got added
    this.assertEqual(this.db.findOne({
        u: -3
    }).a, -1);
    this.assertEqual(this.db.findOne({
        u: -3,
        a: -2
    }), null);
}
DBTestData.prototype.testUpsertOne = function () {
    //  Need a primary key for upserts
    var db = new jsObjDB("u");
    db.insertOne({
        u: 5,
        a: 1
    });
    db.insertOne({
        u: 6,
        a: 2
    });
    db.upsertOne({
        u: 5,
        a: -1
    }, function (info) {
        this.assertEqual(info.inserted.length, 0, "Incorrect number inserted");
        this.assertEqual(info.updated.length, 1, "Incorrect number updated");
        this.assertEqual(info.updated[0].u, 5);
        this.assertEqual(info.updated[0].a, -1);
        this.assertEqual(db.findOne({
            u: 5
        }).a, -1);
    }, this);
    //    console.log("About to test raises");
    this.assertThrows(function () {
        db.upsertOne({
            a: -1
        });
    }, "Upsert without unique key fails to raise");

}
DBTestData.prototype.testUpsert = function () {
    //  Create objects - 2 should fail, one should update
    var db = new jsObjDB("u");
    db.insertOne({
        u: 5,
        a: 1
    });
    db.insertOne({
        u: 6,
        a: 2
    });
    db.insertOne({
        u: 1,
        a: 2
    });
    db.insertOne({
        u: 9,
        a: 9
    });

    var objs = [{
        a: -1,
        u: 5
    }, {
        a: -2,
        u: 6
    }, {
        a: -4,
        u: -1
    }, {
        a: -5,
        _id: 3
    }, {
        u: 1,
        _id: 3
    }];
    var ret = db.upsert(objs);
    this.assertEqual(ret.inserted.length, 1, "Incorrect number of inserts");
    this.assertEqual(ret.updated.length, 3, "Incorrect number of updates");
    this.assertEqual(ret.failed.length, 1, "Incorrect number of failures");

    //console.log(ret);

    this.assertEqual(ret.failed[0], {
        u: 1,
        _id: 3
    }, "Failure incorrect");
    //  Can't directly compare inserts, as the new elements has an _id now
    this.assertEqual(ret.inserted[0].a, -4, "insert has wrong a");
    this.assertEqual(ret.inserted[0].u, -1, "insert has wrong u");
}

DBTestData.prototype.testIndexOf = function () {
    var objs = [{
        a: -1,
        u: 5
    }, {
        a: -2,
        u: 6
    }, {
        a: -4,
        u: -1
    }, {
        a: -5,
        x: 4
    }, {
        u: 1
    }];

    var db = new jsObjDB("a");
    db.insert(objs);
    var idx = db.find().sort("a").indexOf({
        a: -1
    });
    this.assertEqual(idx, 3, "IndexOf returned incorrect position");
}

DBTestData.prototype.testSubObject = function () {
    var obj1 = {
        a: 1,
        b: {
            c: 3,
            d: {
                e: 5
            }
        }
    };
    var obj2 = {
        a: 2,
        b: {
            c: 4,
            d: {
                f: 6
            }
        }
    };
    var db = new jsObjDB();
    db.insertOne(obj1);
    db.insertOne(obj2);
    var found = db.findOne({
        "b.c": 4
    });
    this.assertEqual(found.b.c, 4, "Found wrong object");
}
DBTestData.prototype.testSubIndex = function () {
    var _this = this;
    this.time("Time Sub Index", function (iter) {
        this.db.find({
            "f.a": 10
        });
    }, 10000);

    this.time("Time Sub No Index", function (iter) {
        this.db.find({
            "f.b": 10
        });
    }, 100);

}
DBTestData.prototype.testArrObject = function () {
    var obj1 = {
        a: 1,
        b: [1, 2, 3, 4]
    };
    var obj2 = {
        a: 2,
        b: {
            c: 4,
            d: [1, 2, 3]
        }
    };
    var obj2 = {
        a: 3,
        b: {
            c: 5,
            d: [{
                e: 1
            }, {
                f: 2
            }]
        }
    };
    var db = new jsObjDB();
    db.insertOne(obj1);
    db.insertOne(obj2);
    //    console.log(db);
    var found = db.findOne({
        "b[1]": 2
    });
    this.assertEqual(found.b[1], 2, "Found wrong object");
    this.assertEqual(db.findOne({
        "c[1]": 2
    }), null, "Find one no match");
    this.assertTrue(db.findOne({
        "b.d[0].e": 1
    }) != null, "Find complex one no match");
}
DBTestData.prototype.testArrIndex = function () {
    var _this = this;
    this.time("Time Sub Arr Index", function (iter) {
        var cur = this.db.find({
            "f.c[1]": 10
        });
        cur.each(function (item, idx) {
            this.assertEqual(item.f.c[1], 10, "Sub Arr element found wrong");

        }, this)
    }, 10000);

    this.time("Time Sub Arr No Index", function (iter) {
        var cur = this.db.find({
            "f.c[0]": 10
        });
        cur.each(function (item, idx) {
            this.assertEqual(item.f.c[0], 10, "Sub Arr element found wrong");

        }, this)
    }, 100);

}
DBTestData.prototype.testLateIndexCreation = function () {
    var db = new jsObjDB();
    var obj1 = {
        a: 1
    };
    var obj2 = {
        a: 1
    };
    db.insertOne(obj1);
    db.insertOne(obj2);
    //  The index cannot be created
    this.assertThrows(function () {
        db.addIndex("a", true);
    });
    this.assertFalse(_.has(db.indexes, "a"));
}
DBTestData.prototype.testTestFunction = function () {
    var db = new jsObjDB();
    for (var i = 0; i < 100; i++) {
        var obj = {
            a: i
        };
        db.insertOne(obj);
    }
    var c = db.findWhere(function (item) {
        return item.a < 10
    });
    this.assertEqual(c.length, 10, "Incorrect number of items returned");
    for (var i = 0; i < c.length; i++) {
        this.assertTrue(c[i].a < 10);
    }
    var c2 = c.filterWhere(function (item) {
        return item.a > 5;
    });
    this.assertEqual(c2.length, 4, "Incorrect number of items returned 2");
    for (var i = 0; i < c2.length; i++) {
        this.assertTrue(c2[i].a > 5);
    }
    var c3 = db.findWhere(function (item) {
        return item.a < -1
    });
    this.assertEqual(c3.length, 0, "Incorrect number of items returned 3");

    var c4 = c3.filterWhere(function (item) {
        return item.a < -1;
    });
    this.assertEqual(c4.length, 0, "Incorrect number of items returned 2");
    var c5 = c2.filterWhere(function (item) {
        return item.a < -1;
    });
    this.assertEqual(c5.length, 0, "Incorrect number of items returned 2");
}
DBTestData.prototype.testPrimaryKey = function () {
    var db = new jsObjDB("a");
    this.assertThrows(function () {
        db.insertOne({
            b: 5
        });
    });
    db.insertOne({
        a: 5
    });
}
DBTestData.prototype.testCount = function () {
    var db = new jsObjDB();
    for (var i = 1; i < 1001; i++) {
        var obj = {
            a: i
        };
        db.insertOne(obj);
        this.assertEqual(db.count(), i, "Failure of count during inserts");
    }
    //  Delete all the even numbers
    db.findWhere(function (item) {
        return item.a % 2 === 0;
    }).delete();
    this.assertEqual(db.count(), 500, "Half should have been deleted. ");
    this.assertEqual(db.count(), db.find().length, "DB count and cursor length should be the same");
}
DBTestData.prototype.testSort = function () {
    var _this = this;
    var cursor = this.db.find().sort("c", true);
    this.time("Check sort asc - length inside for test", function () {
        for (var i = 0; i < cursor.length - 1; i++) {
            _this.assertTrue(cursor[i].c <= cursor[i + 1].c);
        }
    }, 1000);
    cursor = cursor.sort("c", false);
    var len = cursor.length;
    this.time("Check sort desc - length outside for test", function () {
        for (var i = 0; i < len - 1; i++) {
            _this.assertTrue(cursor[i].c >= cursor[i + 1].c);
        }
    }, 1000);
}
DBTestData.prototype.testuniq = function () {
    var db = new jsObjDB();
    db.insertOne({
        a: 1,
        b: {
            c: [1, 2, 3]
        }
    });
    db.insertOne({
        a: 2,
        b: {
            c: [2, 2, 2]
        }
    });
    db.insertOne({
        a: 3,
        b: {
            c: [3, 3, 3]
        }
    });
    db.insertOne({
        a: 4,
        b: {
            c: [4, 3, 4]
        }
    });
    this.assertEqual(db.find().uniq("b.c[1]").length, 2, "Failed unique b.c[1]");
    this.assertEqual(db.find().uniq("b.c[2]").length, 3, "Failed unique b.c[2]");
    this.assertEqual(db.find().uniq("a").length, 4, "Failed unique a");
};

function makeS(len) {
    var arr = [];
    arr.push("1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890");
    arr.push("1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890");
    arr.push("1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890");
    arr.push("1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890");
    arr.push("1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890");
    arr.push("1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890");
    arr.push("1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890");
    arr.push("1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890");
    arr.push("1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890");
    arr.push("1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890" + Math.random());
    return arr.join("");
};

//DBTestData.prototype.testReallyBig = function () {
//    var db = new jsObjDB("i");
//    this.time("Really Big Insert ",
//        function () {
//            for (var i = 0; i < 1000000; i++) {
//                var obj = {
//                    s: makeS(),
//                    b: Math.random(), 
//                    i: i
//                };
//                db.insertOne(obj);
//            }
//
//        }, 1);
//    this.assertEqual(db.count(), 1000000);
//    db.delete();
//    this.time("ManyMany Insert ",
//        function () {
//            for (var i = 0; i < 2000000; i++) {
//                var obj = {
//                    s: "My test",
//                    b: Math.random(),
//                    i: i
//                };
//                db.insertOne(obj);
//            }
//
//        }, 1);
//    this.assertEqual(db.count(), 2000000);
//};

DBTestData.prototype.testAsync = function () {
    var db = new jsObjDB(undefined, true);
    db.addDelegate(1, function (event) {
        console.log("Async Event completed");
    }, this);
    db.insertOne({
        a: 1
    });
    db.insertOne({
        a: 2
    });

    db.find().async_each(function (item) {
        console.log("Async Each on ", item.a);
    });
}

DBTestData.prototype.testArrayUnique = function () {
    var db = new jsObjDB("a");
    db.insertOne({
        a: [1, 2, 3]
    });
    this.assertThrows(function () {
        db.insertOne({
            a: [1, 2, 3]
        });
    }, 'Duplicate allowed');
}
DBTestData.prototype.testArrayFind = function () {
    var db = new jsObjDB();
    db.addIndex("a");
    db.insertOne({
        a: [1, 2, 3],
        b: [5, 6, 7]
    });
    db.insertOne({
        a: [2, 3, 4],
        b: [6, 7, 8]
    });
    db.insertOne({
        a: [3, 4, 5],
        b: [7, 8, 9]
    });
    var cursor = db.find({
        a: {
            $contains: 2
        }
    });
    this.assertEqual(cursor.length, 2, "incorrect find length a");
    cursor = db.find({
        b: {
            $contains: 6
        }
    });
    this.assertEqual(cursor.length, 2, "incorrect find length b");
}
DBTestData.prototype.testArrayIndexFindFind = function () {
    this.time("Array index searches",
        function () {
            var cursor = this.db.find({
                'f.c': {
                    $contains: 7
                }
            });
        },
        100);
    this.time("Array index searches",
        function () {
            var cursor = this.db.find({
                "g": {
                    $contains: 7
                }
            });
        },
        100);
}
DBTestData.prototype.testIndexDelete = function () {
    var db = new jsObjDB();
    db.addIndex("a");
    db.insertOne({
        a: [1, 2, 3],
        b: [5, 6, 7]
    });
    db.insertOne({
        a: [2, 3, 4],
        b: [6, 7, 8]
    });
    db.insertOne({
        a: [3, 4, 5],
        b: [7, 8, 9]
    });
    db.delete({
        a: {
            $contains: 2
        }
    });
    this.assertEqual(db.count(), 1);
    this.assertTrue(typeof db.indexes["a"][1] === 'undefined');
    this.assertTrue(typeof db.indexes["a"][2] === 'undefined');
    this.assertEqual(db.indexes['a'].partitions, 3, "Wrong number of partitions");
}
DBTestData.prototype.testExists = function () {
    this.db.insertOne({
        a: -500
    });
    this.assertTrue(this.db.exists({
        a: {
            $lt: 0
        }
    }));
    this.assertTrue(this.db.find().exists({
        a: -500
    }));

}
DBTestData.prototype.testOrderedUpdate = function () {
    var db = new jsObjDB("index");
    for (var i = 0; i < 100; i++) {
        var o = {
            index: i,
            orig: i
        };
        db.insertOne(o);
    }
    //  Now update all numbers. But it must be done in order so the DB is
    //  ALWAYS consistent
    db.find().sort("index", false).update({
        index: {
            $inc: 1
        }
    });
    //  Now check that all items have index = orig + 1;
    var ok = 0;
    db.find().each(function (item) {
        if (item.index !== item.orig + 1) {
            console.log("BAD Ordered Update");
        } else {
            ok += 1;
        }
    });
    this.assertEqual(ok, db.count());

}
DBTestData.prototype.testSizeof = function() {
    this.db.sizeof();
}

DBTestData.prototype.testToJSON = function () {
    var db = new jsObjDB("index");
    for (var i = 0; i < 5; i++) {
        var o = {
            index: i,
            orig: i
        };
        db.insertOne(o);
    }
    var json = db.toJSON();
    
    var db2 = new jsObjDB().loadFromJSON(json);
    this.assertEqual(db.async, db2.async, "async");
    this.assertEqual(db.prim_key, db2.prim_key, "prim key");
    this.assertEqual(db.count(), db2.count(), "Count");
}

if (is_node) {

    test.unitTests.add("IndexTester", DBTestIndexes);
    test.unitTests.add("DataTester", DBTestData);
} else {
    unitTests.add("IndexTester", DBTestIndexes);
    unitTests.add("DataTester", DBTestData);
}
//unitTests.run();