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
            is_outside_file,
            independent_paths_created = [],
            extend_from_dir,
            files_list,
            files_create_result,
            indexfile_path,
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
            independent_paths_created.push(destination_dir);
        } catch (ex) {
            console.log('[Error!] Cannot create component directory: ' + destination_dir);
            if (_this._debug) {
                console.error(ex);
            }
            return false;
        }

        // Get relative path to component extending from
        if (extend_from) {
            extend_from_dir = path.join(this._config.basedir, extend_from);
        }

        // Create component files
        files_list = this._filterFilesList(Object.keys(_config.files), component_name);
        files_create_result = files_list.every(function (file_id) {
            var filename = _this._getFilePath(component_name, file_id, destination_dir),
                content = _this._getFileContent(component_name, file_id, destination_dir, extend_from_dir);

            // Check whether file is to be placed outside component directory (so we need a separate existence check)
            is_outside_file = _isPathOutsideDir(filename, destination_dir);
            if (is_outside_file) {
                // Check there is no existing file or directory
                try {
                    stats = fs.statSync(filename);
                    if (stats.isFile()) {
                        console.log('[Error!] File exists, stopping to prevent overwrite: ' + filename);
                        return false;
                    } else if (stats.isDirectory()) {
                        console.log('[Error!] Path exists and appears to be a directory: ' + filename);
                        return false;
                    }
                } catch (ex) {
                    // Assume file doesn't exist, everything alright
                }
            }

            // Write file
            try {
                fs.outputFileSync(filename, content, _config.file_write_options);
                console.log('File created: ' + filename);
                if (is_outside_file) {
                    independent_paths_created.push(filename);
                }
                return true;
            } catch (ex) {
                console.log('[Error!] Cannot create file: ' + filename);
                if (_this._debug) {
                    console.error(ex);
                }
                return false;
            }
        });
        // If files creation didn't succeed, cleaning up all created paths
        if (!files_create_result) {
            console.log('[Warning!] Component create error, cleaning up created file structure');
            independent_paths_created.forEach(function (item) {
                fs.removeSync(item);
                console.log('Removing: ' + item);
            });
            return false;
        }

        // Append component entry to build file
        // @todo recursively create buildfiles for each level?
        if (_config.append_to_buildfile && !this._isAbstractComponent(destination)) {
            buildfile_path = path.join(destination_dir, '..') + this._config.file_ext;
            if (_config.allow_buildfile_outside_basedir || !_isPathOutsideDir(buildfile_path, _config.basedir)) {
                // Check whether buildfile exists, and if it has any content
                try {
                    buildfile_content_existing = fs.readFileSync(buildfile_path);
                    buildfile_existed = true;
                    console.log('Buildfile found: ' + buildfile_path);
                } catch (ex) {
                    buildfile_existed = false;
                    console.log('Buildfile doesn\'t exist, creating: ' + buildfile_path);
                }

                // Build up import line: either explicit (indexfile name) or implicit (component dir) indexfile import
                if (this._config.buildfile_explicit_indexfile_import && _isString(this._config.indexfile_id)) {
                    indexfile_path = this._getFilePath(
                        component_name, this._config.indexfile_id, destination_dir, this._config.import_with_ext);
                    buildfile_line = this._getImportLine(_getCorrectedRelativePath(buildfile_path, indexfile_path));
                } else {
                    buildfile_line = this._getImportLine(_getCorrectedRelativePath(buildfile_path, destination_dir), true);
                }

                // Combine import line with newline, if necessary
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
     * @param {string} dir Directory file placed in (or placed relatively to)
     * @param {string} [extend_from_dir] Directory of component extend if performed from
     * @returns {string}
     * @private
     */
    Stylco.prototype._getFileContent = function (component_name, file_id, dir, extend_from_dir) {
        var _this = this,
            file_path = this._getFilePath(component_name, file_id, dir, false),
            file_data = this._config.files[file_id],
            is_virtual_component = this._isVirtualComponent(component_name),
            excluded = [],
            imports,
            lines = [];

        // Detect excluded sections for virtual component
        if (is_virtual_component) {
            if (_isArray(file_data.no_virtual)) {
                excluded = file_data.no_virtual;
            } else if (_isString(file_data.no_virtual)) {
                excluded = [file_data.no_virtual];
            }
        }

        // If appliable, add import for the same-named file within the component extending from
        if (extend_from_dir && file_data.import_extend_source && !~excluded.indexOf('import_extend_source')) {
            var extend_from_component_name = extend_from_dir.split(path.sep).pop(),
                extend_from_filename = this._getFileName(extend_from_component_name, file_id),
                extend_from_path = path.join(extend_from_dir, extend_from_filename);
            lines.push(this._getImportLine(_getCorrectedRelativePath(file_path, extend_from_path)));
        }

        // Append other imports
        if (!~excluded.indexOf('imports')) {
            imports = this._filterFilesList(file_data.imports, is_virtual_component);
            imports.forEach(function (file_id) {
                lines.push(_this._getImportLine(
                    _getCorrectedRelativePath(file_path, _this._getFilePath(component_name, file_id, dir, false))
                ));
            });
        }

        // Append any custom content, applying values interpolation
        if (file_data.content && !~excluded.indexOf('content')) {
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
     * Determine whether component should be treated as virtual
     * @param component_name
     * @returns {boolean}
     * @private
     */
    Stylco.prototype._isVirtualComponent = function (component_name) {
        if (this._config.virtual_component_prefix) {
            return _beginsWith(this._config.virtual_component_prefix, component_name);
        } else {
            return false;
        }
    };

    /**
     * Determine whether component should be treated as abstract
     * Looks for correspondent dirname prefix (if specified in config) on each path level, excluding last one
     * @param {string} destination Component destination as specified by user (e.g. 'somedir/mycomponent')
     * @returns {boolean}
     * @private
     */
    Stylco.prototype._isAbstractComponent = function (destination) {
        var _this = this,
            parts;
        if (this._config.abstract_dir_prefix) {
            parts = _splitPath(destination);
            parts.pop(); // remove component name
            return parts.some(function (item) {
                return _beginsWith(_this._config.abstract_dir_prefix, item);
            });
        } else {
            return false;
        }
    };

    /**
     * Filter files list depending on file existence and availability for current component
     * @param {string|string[]} imports Input list of file IDs (or single item as string)
     * @param {boolean|string} is_virtual_component Is target component virtual? (Or component name for autodetect)
     * @returns {string[]} Input list with items not existing for the component filtered off
     */
    Stylco.prototype._filterFilesList = function (imports, is_virtual_component) {
        var _files = this._config.files;

        // Convert input string to single-item array
        if (_isString(imports)) {
            imports = [imports];
        }

        // If list format isn't recognized, return empty list
        if (!_isArray(imports)) {
            return [];
        }

        // Detecting whether component is virtual if component name is passed instead of boolean
        if (_isString(is_virtual_component)) {
            is_virtual_component = this._isVirtualComponent(is_virtual_component);
        }

        // Filter off list items by the following criteria:
        imports = imports.filter(function (file_id) {
            // 1. File is not listed in config
            if (!_files.hasOwnProperty(file_id)) {
                return false;
            }
            // 2. File is not created for current virtual component
            if (is_virtual_component && (_files[file_id].no_virtual === true)) {
                return false;
            }
            // Keep all other items
            return true;
        });

        // Return processed items list
        return imports;
    };

    /**
     * Build up file name usable for import rule
     * @param {string} component_name Component name
     * @param {string} file_id File ID in `files` config key
     * @returns {string}
     * @private
     */
    Stylco.prototype._getFileName = function (component_name, file_id) {
        return _replaceVars(this._config.files[file_id].filename, {
            'NAME': component_name,
            'INDEX': this._config.index_file
        });
    };

    /**
     * Build up path to file usable for reading file content
     * @param {string} component_name Component name
     * @param {string} file_id File ID in `files` config key
     * @param {string} dir Directory file placed in (or placed relatively to)
     * @param {boolean=true} [with_ext] Also append file extension
     * @returns {string}
     * @private
     */
    Stylco.prototype._getFilePath = function (component_name, file_id, dir, with_ext) {
        var file_path;
        if (_isUndefined(with_ext)) {
            with_ext = true;
        }
        file_path = path.join(dir, this._getFileName(component_name, file_id));
        if (with_ext) {
            file_path += this._config.file_ext;
        }
        return file_path;
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
     * @property {string} indexfile_id
     * @property {string} import_rule
     * @property {boolean} import_with_ext
     * @property {boolean} append_to_buildfile
     * @property {boolean} buildfile_explicit_indexfile_import
     * @property {boolean} allow_buildfile_outside_basedir
     * @property {string} quote
     * @property {boolean} use_semicolons
     * @property {string} indent
     * @property {string} newline
     * @property {boolean} ensure_trailing_newline
     * @property {FileWriteOptions} file_write_options
     * @property {string|null} virtual_component_prefix
     * @property {string|null} abstract_dir_prefix
     * @property {object<string, StylcoConfigFileItem>} files
     */

    /**
     * @typedef {object} StylcoConfigFileItem
     * @property {string} filename
     * @property {string|string[]} imports
     * @property {boolean} [import_extend_source]
     * @property {string} [content]
     * @property {boolean|string|string[]} [no_virtual]
     */

    /**
     * @typedef {object|string} FileWriteOptions
     * @property {string} [encoding]
     * @property {number} [mode]
     * @property {string} [flag]
     */


    /**
     * Indicate whether string begins with another string
     * Can also be used for array (in that case, checks its first element)
     * @param {*} search What to search
     * @param {string|*[]} subject Where to search
     * @returns {boolean}
     * @private
     */
    function _beginsWith (search, subject) {
        return (subject.indexOf(search) === 0);
    }

    /**
     * Splits path by any slash found
     * Excludes empty levels
     * @param {string} path_string Input path (e.g. '/some/path/provided/' or even 'some\\path/provided//')
     * @returns {string[]} All path levels, excluding zero length names (e.g. ['some', 'path', 'provided'])
     * @private
     */
    function _splitPath(path_string) {
        return path_string.split(/\\|\//).filter(function (item) {
            return (item.length > 0);
        });
    }

    /**
     * Removes one extra parent level returned by path.relative
     * Also replaces '' (empty string) result with '../name'
     * @see http://stackoverflow.com/questions/31023972/node-path-relative-returns-incorrect-path (extra parent level)
     * @param {string} from
     * @param {string} to
     * @private
     */
    function _getCorrectedRelativePath(from, to) {
        var relative = path.relative(path.dirname(from), to);
        return (relative !== '') ? relative : path.join('..', path.basename(to));
    }

    /**
     * Check if provided path is outside the reference directory
     * @param {string} test_path Tested path
     * @param {string} dir Reference directory
     * @returns {boolean}
     * @private
     */
    function _isPathOutsideDir(test_path, dir) {
        var relative = path.relative(dir, test_path);
        return _beginsWith('..', relative);
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
