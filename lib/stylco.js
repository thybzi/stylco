module.exports = function (debug) {
    'use strict';

    var fs = require('fs-extra'),
        path = require('path'),
        Stylco;


    /**
     * Initialize new instance of Stylco
     * @param {boolean} debug Set true to enable debug mode
     * @constructor
     */
    Stylco = function (debug) {
        this._init(debug);
    };

    /**
     * Name of the configuration file (both module-level defaults and user-level overrides)
     * @type {string}
     */
    Stylco.prototype.CONFIG_FILE_NAME = '.stylcorc';

    /**
     * Module configuration options
     * @type {StylcoConfig}
     * @private
     */
    Stylco.prototype._config = undefined;

    /**
     * Indicates whether debug mode is enabled
     * @type {boolean}
     * @private
     */
    Stylco.prototype._debug = undefined;

    /**
     * Create Stylus component file/directory structure
     * @param {string} destination Destination directory (relative to `basedir` config param)
     * @param {string} [extend_from] Directory of component to extend from (relative to `basedir` config param)
     */
    Stylco.prototype.create = function (destination, extend_from) {
        var _this = this,
            _config = this._config,
            component_name = path.basename(destination),
            destination_dir = path.join(this._config.basedir, destination),
            stats,
            extend_from_relative,
            files_create_result,
            buildfile_path,
            buildfile_existed,
            buildfile_line,
            buildfile_content_existing,
            buildfile_content_appended;

        // Check there is no existing directory of file
        try {
            stats = fs.statSync(destination_dir);
            if (stats.isDirectory()) {
                console.log('[Error!] Directory exists, stopping to prevent overwrite: ' + destination_dir);
                return false;
            } else if (stats.isFile()) {
                console.log('[Error!] Path exists and appears to be a file: ' + destination_dir);
                return false;
            }
        } catch (ex) {
            // Assume directory doesn't exist, everything alright
        }

        // Create component directory
        try {
            fs.ensureDirSync(destination_dir);
            console.log('Directory created: ' + destination_dir);
        } catch (ex) {
            console.log('[Error!] Cannot create component directory: ' + destination_dir);
            if (_this._debug) {
                console.error(ex);
            }
            return false;
        }

        // Get relative path to component extending from
        if (extend_from) {
            extend_from_relative = path.relative(destination_dir, path.join(this._config.basedir, extend_from));
        }

        // Create component files
        files_create_result = Object.keys(_config.files).every(function (file_id) {
            var filename = _this._getFilePath(component_name, file_id, destination_dir);
            try {
                var content = _this._getFileContent(component_name, file_id, extend_from_relative);
                fs.writeFileSync(filename, content, _config.file_write_options);
                console.log('File created: ' + filename);
                return true;
            } catch (ex) {
                console.log('[Error!] Cannot create file: ' + filename);
                if (_this._debug) {
                    console.error(ex);
                }
                return false;
            }
        });
        if (!files_create_result) {
            return false;
        }

        // Append component entry to build file
        // @todo recursively create buildfiles for each level?
        if (_config.append_to_buildfile) {
            buildfile_path = path.join(destination_dir, '..') + this._config.file_ext;
            if (_config.allow_buildfile_outside_basedir || !_isPathOutsideDir(_config.basedir, buildfile_path)) {
                // Check whether buildfile exists, and if it has any content
                try {
                    buildfile_content_existing = fs.readFileSync(buildfile_path);
                    buildfile_existed = true;
                    console.log('Buildfile found: ' + buildfile_path);
                } catch (ex) {
                    buildfile_existed = false;
                    console.log('Buildfile doesn\'t exist, creating: ' + buildfile_path);
                }

                // Build up import line and combine it with newline, if necessary
                buildfile_line = this._getImportLine(
                    path.join(path.parse(buildfile_path)['name'], component_name), true);
                if (_config.ensure_trailing_newline) {
                    buildfile_content_appended = buildfile_line + _config.newline;
                } else if (buildfile_existed && buildfile_content_existing.length) {
                    buildfile_content_appended = _config.newline + buildfile_line;
                } else {
                    buildfile_content_appended = buildfile_line;
                }

                // Append component import line to buildfile, creating buildfile if not exists
                try {
                    fs.appendFileSync(buildfile_path, buildfile_content_appended, _config.file_write_options);
                    if (!buildfile_existed) {
                        console.log('Buildfile created: ' + buildfile_path);
                    }
                    console.log('Import line appended to buildfile: ' + buildfile_line);
                } catch (ex) {
                    if (buildfile_existed) {
                        console.log('[Error!] Cannot append line to buildfile: ' + buildfile_path);
                    } else {
                        console.log('[Error!] Cannot create buildfile: ' + buildfile_path);
                    }
                    if (_this._debug) {
                        console.error(ex);
                    }
                    return false;
                }
            }
        }

        // Success
        return true;
    };

    /**
     * Build up content for given file type of the component
     * @param {string} component_name Component name
     * @param {string} file_id File ID in `files` config key
     * @param {string} [extend_from_relative] Relative path to component extend if performed from
     * @returns {string}
     * @private
     */
    Stylco.prototype._getFileContent = function (component_name, file_id, extend_from_relative) {
        var _this = this,
            imports,
            lines = [];

        // If appliable, add import for the same-named file within the component extending from
        if (extend_from_relative && this._config.files[file_id].import_extend_source) {
            lines.push(this._getImportLine(extend_from_relative));
        }

        // Append other imports
        imports = this._config.files[file_id].imports;
        if (_isString(imports)) {
            imports = [imports];
        }
        if (_isArray(imports)) {
            imports.forEach(function (file_id) {
                lines.push(_this._getImportLine(_this._getFileName(component_name, file_id)));
            });
        }

        // Append any custom content, applying values interpolation
        if (this._config.files[file_id].content) {
            lines.push(_replaceVars(this._config.files[file_id].content, {
                'NAME': component_name,
                'IMPORT': this._config.import_rule,
                'SEMICOLON': this._getSemicolonChar(),
                'QUOTE': this._config.quote,
                'NEWLINE': this._config.newline,
                'INDENT': this._config.indent
            }));
        }

        // Append trailing newline
        if (this._config.ensure_trailing_newline) {
            lines.push('');
        }

        // Join lines and return results
        return lines.join(this._config.newline);
    };

    /**
     * Build up file name usable for import rule
     * @param {string} component_name Component name
     * @param {string} file_id File ID in `files` config key
     * @returns {string}
     * @private
     */
    Stylco.prototype._getFileName = function (component_name, file_id) {
        return _replaceVars(this._config.files[file_id].filename, {'NAME': component_name});
    };

    /**
     * Build up path to file usable for reading file content
     * @param {string} component_name Component name
     * @param {string} file_id File ID in `files` config key
     * @param {string} dir File directory
     * @returns {string}
     * @private
     */
    Stylco.prototype._getFilePath = function (component_name, file_id, dir) {
        return path.join(dir, this._getFileName(component_name, file_id) + this._config.file_ext);
    };

    /**
     * Build up import line for the given component
     * @param {string} import_path Path to component
     * @param {boolean} [is_dir] Explicitly specify path to be directory (not file)
     * @returns {string}
     * @private
     */
    Stylco.prototype._getImportLine = function (import_path, is_dir) {
        var _config = this._config;
        import_path = _unixSlashesPath(import_path);
        if (!is_dir && _config.import_with_ext) {
            import_path += _config.file_ext;
        }
        return _config.import_rule + ' ' + _config.quote + import_path + _config.quote + this._getSemicolonChar();
    };

    /**
     * Return semicolon or empty string, respecting current configuration settings
     * @returns {string}
     * @private
     */
    Stylco.prototype._getSemicolonChar = function () {
        return this._config.use_semicolons ? ';' : '';
    };

    /**
     * Get and merge module-level config defaults and user-level config overrides
     * If value exists in user config, it is overriden entirely
     * Also apply debug mode value
     * @private
     */
    Stylco.prototype._init = function (debug) {
        var _config,
            config_defaults,
            user_config,
            user_config_file,
            user_config_content,
            option;

        // Set debug mode value
        this._debug = !!debug;
        if (this._debug) {
            console.log('Debug mode is enabled\n');
        }

        // Read config defaults
        config_defaults = JSON.parse(fs.readFileSync(path.join(__dirname, '..', this.CONFIG_FILE_NAME)));

        // Try to read and parse user config
        user_config_file = path.join(process.cwd(), this.CONFIG_FILE_NAME);
        user_config = {};
        try {
            user_config_content = fs.readFileSync(user_config_file);
            try {
                user_config = JSON.parse(user_config_content);
            } catch (ex) {
                console.log('[Warning!] `' + user_config_file + '` content is not valid JSON; using config defaults.')
            }
        } catch (ex) {
        }

        // Fill instance config with option values
        // If user config doesn't contain an option, default value is used
        // Otherwise, user value overrides default value entirely (no merge for arrays etc.)
        _config = {};
        for (option in config_defaults) {
            if (!config_defaults.hasOwnProperty(option)) {
                continue;
            }
            _config[option] = user_config.hasOwnProperty(option) ? user_config[option] : config_defaults[option];
        }

        // JSON cannot store octal numbers, so file write mode may need type conversion (e.g. '0o644' => 0o644)
        if (_isObject(_config.file_write_options) && _isString(_config.file_write_options.mode)) {
            _config.file_write_options.mode = Number(_config.file_write_options.mode); // parseInt is bugs, so Number()
        }

        // Apply final config values
        this._config = _config
    };

    /**
     * @typedef {object} StylcoConfig
     * @property {string} basedir
     * @property {string} file_ext
     * @property {string} import_rule
     * @property {string} import_with_ext
     * @property {boolean} append_to_buildfile
     * @property {boolean} allow_buildfile_outside_basedir
     * @property {string} quote
     * @property {boolean} use_semicolons
     * @property {string} indent
     * @property {string} newline
     * @property {boolean} ensure_trailing_newline
     * @property {FileWriteOptions} file_write_options
     * @property {object<string, StylcoConfigFileItem>} files
     */

    /**
     * @typedef {object} StylcoConfigFileItem
     * @property {string} filename
     * @property {string|string[]} imports
     * @property {boolean} [import_extend_source]
     * @property {string} [content]
     */

    /**
     * @typedef {object|string} FileWriteOptions
     * @property {string} [encoding]
     * @property {number} [mode]
     * @property {string} [flag]
     */


    /**
     * Check if provided path is outside the reference directory
     * @param {string} test_path Tested path
     * @param {string} dir Reference directory
     * @returns {boolean}
     * @private
     */
    function _isPathOutsideDir(test_path, dir) {
        var relative = path.relative(dir, test_path);
        return (relative.indexOf('..') === 0);
    }

    /**
     * Reformat path with coerced forward slashes (Unix-style)
     * @param {string} input_path Input path (may be \\-slashed in Windows-style)
     * @returns {string}
     * @private
     */
    function _unixSlashesPath(input_path) {
        return input_path.split('\\').join('/');
    }

    /**
     * Replace template variables with values (e.g. '{{NAME}}' => 'My name') in provided string
     * @param {string} string Input string
     * @param {object<string, string>} values Name-value dictionary; name should be provided WITHOUT curly braces
     * @returns {string}
     * @private
     */
    function _replaceVars(string, values) {
        var varname,
            search;
        for (varname in values) {
            if (!values.hasOwnProperty(varname)) {
                continue;
            }
            search = new RegExp('{{' + varname + '}}', 'g');
            string = string.replace(search, values[varname]);
        }
        return string;
    }


    /**
     * Indicate whether value passed is undefined
     * @param value
     * @returns {boolean}
     * @private
     */
    function _isUndefined (value) {
        return typeof value === 'undefined';
    }


    /**
     * Indicate whether value passed is null
     * @param value
     * @returns {boolean}
     * @private
     */
    function _isNull (value) {
        return value === null;
    }

    /**
     * Indicate whether value passed is string
     * @param {*} value
     * @returns {boolean}
     * @private
     */
    function _isString (value) {
        return typeof value === 'string';
    }

    /**
     * Indicate whether value passed has type 'object'
     * Beware: array and null do have this type, too!
     * @param {*} value
     * @returns {boolean}
     * @private
     */
    function _isObject (value) {
        return typeof value === 'object';
    }

    /**
     * Indicate whether value passed is array
     * @param {*} value
     * @returns {boolean}
     * @private
     */
    function _isArray (value) {
        return value && _isObject(value) && (value instanceof Array);
    }


    // Create and return Stylco instance
    return new Stylco(debug);
};
