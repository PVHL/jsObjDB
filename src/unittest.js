/*jslint node: true */ //  Permit file level "use strict"
/*jslint nomen: true */ //  Permit leading "_" character
/*global  _ */

"use strict";
//  Set to false if we are not using node
var is_node = (typeof module !== 'undefined' && module.exports);
//  Uncomment this line if running in node.js
if (is_node) {
    var _ = require("../lib/lo-dash.min.js");
}

var UnitTest = function () {
    this.tests = [];
    this.test_count = 0;
    this.success_count = 0;
    this.start = new Date();
    this.autorun = true;
};
UnitTest.prototype.add = function (title, testClass) {
    var testObj = {
        title: title,
        testClass: testClass
    };
    this.tests.push(testObj);

    //  We now run them as soon as they are added.
    if (this.autorun) {
        this.runOne(testObj);
        this.report();
    }

};
UnitTest.prototype.report = function () {
    this.end = new Date();
    console.log("Tests:" + this.test_count + " Successes:" + this.success_count + " Failures:" + (this.test_count - this.success_count) +
        " Total time: " + (this.end - this.start) + "ms");

};
//  Run them all
UnitTest.prototype.run = function () {
    //  Reset the counters and run them all
    this.test_count = 0;
    this.success_count = 0;
    this.start = new Date();
    _.each(this.tests, this.runOne, this);
    this.report();

};
UnitTest.prototype.runOne = function (item) {
    var testObj = new item.testClass();
    //        console.log("Running test", item, testObj);
    _.forIn(testObj, function (fn, name) {
        if (!_.isFunction(fn)) {
            return;
        }
        //  Test functions always begin with "test"
        if (!/^test.*$/.test(name)) {
            return;
        }
        //            console.log("Testing fn", name);
        this.test_count += 1;
        var success = false;
        try {
            try {
                testObj.setUp();
            } catch (e) {
                console.log(item.title + "." + name + " setUp failure: ", e);
                //  Dont bother continuing the test. 
                success = false;
                return;
            }

            try {
                testObj[name]();
                success = true;
                console.log(item.title + "." + name + " success");
            } catch (e) {
                console.log(item.title + "." + name + " failure: ", e);
            }
            try {
                testObj.tearDown();
            } catch (e) {
                console.log(item.title + "." + name + " tearDown failure: ", e);
                //  The test might have worked... but if the tearDown fails... thats a failure.
                success = false;
            }
        } finally {
            if (success) {
                this.success_count += 1;
            }
        }
    }, this);

};

var unitTests = new UnitTest();

var TestCase = function () {};
TestCase.prototype.setUp = function () {};
TestCase.prototype.tearDown = function () {};

TestCase.prototype.iterate = function (fn, iterations) {
    iterations = iterations || 1;
    var f = _.bind(fn, this);
    for (var i = 0; i < iterations; i++) {
        f(i);
    }
};

TestCase.prototype.assertThrows = function (fn, msg) {
    var f = _.bind(fn, this);
    var success = true;
    msg = msg ? msg : "Should have thrown";
    try {
        f();
        success = false;
    } catch (e) {}
    if (!success) {
        throw "Should have thrown";
    }
};
TestCase.prototype.assertTrue = function (value, msg) {
    msg = msg || "Expected true, got false";
    if (!value)
        throw msg;
};
TestCase.prototype.assertFalse = function (value, msg) {
    msg = msg || "Expected false, got true";
    if (value)
        throw msg;
};
TestCase.prototype._equal = function (v1, v2) {
    var equal;
    if (_.isArray(v1, v2) || _.isObject(v1, v2)) {
        equal = _.isEqual(v1, v2);
    } else {
        equal = v1 === v2;
    }
    return equal;
};
TestCase.prototype.assertEqual = function (value1, value2, msg) {
    msg = msg || "";
    if (!this._equal(value1, value2)) {
        throw msg + " - " + value1 + " !== " + value2;
    }
};
TestCase.prototype.assertNotEqual = function (value1, value2, msg) {
    msg = msg || "";
    if (this._equal(value1, value2))
        throw msg + " - " + value1 + " === " + value2;
}
TestCase.prototype.time = function (title, fn, iterations) {
    iterations = iterations === undefined ? 1 : iterations;
    var start = Date.now();
    this.iterate(fn, iterations);
    var end = Date.now();
    console.log(title, iterations, "iterations took", end - start, "milliseconds");
}

var TestTester = function () {}
TestTester.prototype = new TestCase();
TestTester.prototype.setUp = function () {
    return true;
};
TestTester.prototype.tearDown = function () {
    return true;
};
TestTester.prototype.testAssert = function () {
    this.assertThrows(function () {
        throw "test"
    });
    this.assertFalse(false, "My Message");
    this.assertTrue(true, "My Message");
    this.assertEqual(0, 0, "My Message");
    this.assertNotEqual(5, 6, "My Message");
};
TestTester.prototype.testEqual = function () {
    this.assertThrows(function () {
        throw "test"
    });
    this.assertEqual([1, 2, 3], [1, 2, 3], "My Message");
    this.assertEqual({
        a: 1,
        b: 2
    }, {
        a: 1,
        b: 2
    }, "My Message");
    this.assertNotEqual([1, 2, 3], [2, 1, 3], "My Message");
    this.assertNotEqual({
        a: 2,
        b: 2
    }, {
        a: 1,
        b: 2
    }, "My Message");
};
unitTests.add("TestTester", TestTester);

if (is_node) {
    module.exports.TestCase = TestCase;
    module.exports.UnitTest = UnitTest;
    module.exports.unitTests = unitTests;
};