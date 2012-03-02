var fs = require('fs');
var path = require('path');
var xml2js = require('xml2js');
var handleWrapper = require('ydpatterns').handleWrapper;
var async = require('async');

//
// Get Azure configuration.
// notification - callback that receives configuration snapshots. The notifiction is called with initial configuration
//                and upon each change.
// returns - handle which should be closed to stop configuration notificiations.
//
module.exports = function (notification) {

    var folder = process.env.AZURECONFIG || path.join('c:', 'config');
    var watcher = null;
    var roleEnvironment = null;

    function initialize(callback) {

        _loadConfiguration(function (err) {
            if (err) {
                console.error('Failed to load configuration, err:', err);
            }
            else {
                // Notifify with the 1st snapshot of configuration.
                notification(roleEnvironment);
            }
            // Start watching anyway, even if file was not loaded.
            _startWatch();
            callback(err);
        });

        function _loadConfiguration(callback) {
            console.log('Configuration folder:', folder);
            fs.readdir(folder, function (err, files) {
                if (err) {
                    console.warn('Failed to read from ' + folder + ', err:', err);
                    return callback(err);
                }
                _obtainLatestConfigurationFile(files, function (err, file) {
                    if (err) {
                        console.warn('Failed to obtain configuration file from ' + folder + ', err:', err);
                        return callback(err);
                    }
                    _parseConfiguration(file, callback);
                });
            });
        }

        function _obtainLatestConfigurationFile(files, callback) {
            var latest = 0;
            var configFile = null;

            async.forEachSeries(files, function (file, cb) {
                if (!! ~file.indexOf('.xml')) {
                    var f = path.join(folder, file);
                    fs.readFile(f, function (err, content) {
                        if (content.toString().indexOf('<RDConfig') === -1) {
                            return cb();
                        }
                        fs.stat(f, function (err, stats) {
                            if (err) {
                                console.warn('Failed to obtain stats for ' + f + ' err:', err);
                            }
                            else {
                                var timestamp = stats.mtime.valueOf();
                                if (latest < timestamp) {
                                    latest = timestamp;
                                    configFile = f;
                                }
                            }
                            cb();
                        });
                    });
                }
                else {
                    cb();
                }
            },
            function () {
                var err;
                if (!configFile) {
                    err = 'Unable to find a config file in ' + folder;
                    console.error(err);
                }
                callback(err, configFile);
            });
        }

        function _parseConfiguration(file, callback) {
            fs.readFile(file, function (err, xml) {
                if (err) {
                    console.error('Failed to read ' + file + ', err:', err);
                    return callback(err);
                }
                var parser = new xml2js.Parser();
                parser.parseString(xml, function (err, result) {
                    if (err) {
                        console.warn('Failed to parse ' + file + ', err:', err);
                    }
                    else {
                        _transformConfig(result);
                    }
                    callback(err);
                });
            });
        }

        function _transformConfig(config) {
            roleEnvironment = {};
            roleEnvironment.deploymentId = config.Deployment['@'].name;
            roleEnvironment.instanceId = config.Incarnation['@'].instance;
            roleEnvironment.ApplicationSettings = _getApplicationsSettings(config);
            roleEnvironment.ResourceReferences = _getResourceReferences(config);
            _getRoles(config);
        }

        function _getApplicationsSettings(config) {
            var settings = {};
            config.ApplicationSettings.Setting.forEach(function (s) {
                settings[s['@'].name] = s['@'].value;
            });
            return settings;
        }

        function _getResourceReferences(config) {
            var resources = {};
            config.ResourceReferences.Resource.forEach(function (s) {
                resources[s['@'].name] = { path: path.join('c:', 'resources', 'directory', s['@'].path), size: s['@'].size };
            });
            return resources;
        }

        function _getRoles(config) {

            var roles = {};

            if (!config.Instances.Instance.length) {
                config.Instances.Instance = [config.Instances.Instance];
            }

            config.Instances.Instance.forEach(function (i) {
                var instance = {};
                instance.id = i['@'].id;
                instance.endpoints = [];

                if (!i.InputEndpoints.Endpoint.length) {
                    i.InputEndpoints.Endpoint = [i.InputEndpoints.Endpoint];
                }

                i.InputEndpoints.Endpoint.forEach(function (ep) {
                    var endpoint = {};
                    ep = ep['@'];

                    endpoint.name = ep.name;
                    endpoint.protocol = ep.protocol;
                    var addr = ep.address;

                    endpoint.host = addr.substring(0, addr.indexOf(':'));
                    endpoint.port = addr.substring(addr.indexOf(':') + 1);
                    instance.endpoints.push(endpoint);
                });

                var role = instance.id.substring(0, instance.id.indexOf("_"));
                if (!roles[role]) roles[role] = { name: role, instances: [] };
                roles[role].instances.push(instance);
            });

            roleEnvironment.roles = [];

            for (var roleName in roles) {
                roleEnvironment.roles.push(roles[roleName]);
            }
        }

        function _startWatch() {
            console.log('Start watching ' + folder);
            watcher = fs.watch(folder, { persistent: false }, function (event, filename) {
                if (event === 'change') {
                    console.log('change in file ' + filename);
                    _loadConfiguration(function (err) {
                        if (err) {
                            console.warn('Failed to load notification upon change, err:', err);
                        }
                        else {
                            notification(roleEnvironment);
                        }
                    });
                }
            });
        }
    }

    function cleanup(callback) {
        console.log('stop monitoring configuration');
        if (watcher) {
            // Stop handling change events.
            watcher.removeAllListeners();
            // Leave watcher on error events that may come from unclosed handle.
            watcher.on('error', function (err) { });
        }
        callback();
    }

    return handleWrapper({ initialize: initialize, cleanup: cleanup });
}