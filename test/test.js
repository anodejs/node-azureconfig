var testCase = require('nodeunit').testCase;
var path = require('path');
var azureconfig = require('../main');
var rimraf = require('rimraf');
var mkdirp = require('mkdirp');
var futil = require('fileutils');

module.exports = testCase({

    setUp: function (callback) {
        this.folder = path.join(process.env.TMP || process.env.TMPDIR, 'azureconfig', Math.round(Math.random() * 100000).toString());
        console.log('Folder:' + this.folder);
        mkdirp(this.folder, callback);
    },

    tearDown: function (callback) {
        rimraf(this.folder, function (err) {
            callback(err);
        });
    },

    load: function (test) {
        process.env.AZURECONFIG = path.join(__dirname, 'testload');
        var handle = azureconfig(function (configuration) {
            test.equal(configuration.instanceId, 'anodejsrole_IN_0', 'should load configuration');
            handle.close(function () {
                test.done();
            });
        });
    },

    choice: function (test) {
        var self = this;
        process.env.AZURECONFIG = self.folder;
        futil.copyFile(path.join(__dirname, 'testchoice', 'test2.xml'), path.join(self.folder, 'test2.xml'), function () {
            // test1 copied last and it should be chosen.
            futil.copyFile(path.join(__dirname, 'testchoice', 'test1.xml'), path.join(self.folder, 'test1.xml'), function () {
                var handle = azureconfig(function (configuration) {
                    test.equal(configuration.instanceId, 'role1_IN_0', 'should load latest which is test1');
                    handle.close(function () {
                        test.done();
                    });
                });
            });
        });
    },

    mixed: function (test) {
        var self = this;
        process.env.AZURECONFIG = self.folder;
        futil.copyFile(path.join(__dirname, 'testchoice', 'test2.xml'), path.join(self.folder, 'test2.xml'), function () {
            // test1 copied last and it should be chosen.
            futil.copyFile(path.join(__dirname, 'testchoice', 'notaconfig.xml'), path.join(self.folder, 'test1.xml'), function () {
                var handle = azureconfig(function (configuration) {
                    test.equal(configuration.instanceId, 'role2_IN_0', 'should load valid configuration file');
                    handle.close(function () {
                        test.done();
                    });
                });
            });
        });
    },

    change: function (test) {
        var self = this;
        var step = 0;
        process.env.AZURECONFIG = self.folder;
        futil.copyFile(path.join(__dirname, 'testchoice', 'test1.xml'), path.join(self.folder, 'test.xml'), function () {
            var handle = azureconfig(function (configuration) {
                var previousStep = step++;
                if (previousStep === 0) {
                    test.equal(configuration.instanceId, 'role1_IN_0', 'should load configuration from original test1');
                    futil.copyFile(path.join(__dirname, 'testchoice', 'test2.xml'), path.join(self.folder, 'test.xml'));
                    return;
                }
                if (previousStep === 1) {
                    test.equal(configuration.instanceId, 'role2_IN_0', 'should load configuration from test2');
                    handle.close(function () {
                        test.done();
                    });
                    return;
                }
                console.log('another notification');
            });
        });

    },

    newfile: function (test) {
        var self = this;
        var step = 0;
        process.env.AZURECONFIG = self.folder;
        futil.copyFile(path.join(__dirname, 'testchoice', 'test1.xml'), path.join(self.folder, 'test1.xml'), function () {
            var handle = azureconfig(function (configuration) {
                var previousStep = step++;
                if (previousStep === 0) {
                    test.equal(configuration.instanceId, 'role1_IN_0', 'should load configuration from original test1');
                    setTimeout(function () {
                        futil.copyFile(path.join(__dirname, 'testchoice', 'test2.xml'), path.join(self.folder, 'test2.xml'));
                    }, 1000); // need at least a second for modification timestamp resolution
                    return;
                }
                if (previousStep === 1) {
                    test.equal(configuration.instanceId, 'role2_IN_0', 'should load configuration from test2');
                    handle.close(function () {
                        test.done();
                    });
                    return;
                }
                console.log('another notification');
            });
        });

    },

    newempty: function (test) {
        var self = this;
        var step = 0;
        process.env.AZURECONFIG = self.folder;
        var handle = azureconfig(function (configuration) {
            test.equal(configuration.instanceId, 'anodejsrole_IN_0', 'should get configuration eventually');
            handle.close(function () {
                test.done();
            });
        });
        setTimeout(function () {
            futil.copyFile(path.join(__dirname, 'testload', 'test.xml'), path.join(self.folder, 'xaxa.xml'));
        }, 200);
    },

    missingfile: function (test) {
        process.env.AZURECONFIG = path.join(__dirname, 'testmissing');
        var handle = azureconfig(function () {
            test.ok(false, 'should not get to here');
        });
        setTimeout(function () {
            handle.close(function () {
                test.done();
            });
        }, 200);
    }
});