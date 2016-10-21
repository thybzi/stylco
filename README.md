Stylco
=====
Command-line tool that simplifies creating style components on [Stylus](http://stylus-lang.com/) by generating directory structure and imports.

Can also be used with other CSS preprocessors (such as [LESS](http://lesscss.org/) or [SASS](http://sass-lang.com/)) with some necessary [configuration](#configuration).


### What does it do, exactly? ###

Creates file structure similar to following (all [configurable](#configuration)) *with a single CLI command*:
```
stylco mycomponent
```
results:
```
|-- mycomponent
|   |-- mycomponent.styl
|   |-- mycomponent__constants.styl
|   |-- mycomponent__mixins.styl
|   |-- __.styl     // imports constants and mixins
|   `-- index.styl  // imports __.styl and mycomponent.styl
|
|-- othercomponent ...
``` 

### Command line usage ###
Global installation mode is preferred:
```
npm install -g stylco
```
Basic usage:
```
stylco mycomponent
```
Extend another component (that means, add imports to same-called files):
```
stylco mycomponent othercomponent
```
Create component in subdirectory (and a subdirectory itself, if not exists).
(Also can add `@import 'desktop/mycomponent'` line into `desktop.styl`, if [append_to_buildfile](#append_to_buildfile) options is enabled.)
```
stylco desktop/mycomponent
```
Extend from another subdirectory:
```
stylco mobile/mycomponent _base/mycomponent
stylco desktop/othercomponent _base/foobar
```
And, if anything goes wrong:
```
stylco desktop/othercomponent _base/foobar --debug
```
**All paths are relative to [basedir](#basedir) value** (default is `'styl/'`).


### JavaScript API ###
If you really need it...
```
npm install --save stylco
```
Common mode:
```javascript
var stylco = require('stylco');
stylco.create('mycomponent');
stylco.create('mycomponent', 'othercomponent');
stylco.create('desktop/othercomponent', '_base/foobar');
```
Debug mode (note the `true`):
```javascript
var stylco = require('stylco')(true);
stylco.create('desktop/othercomponent', '_base/foobar');
```


### Configuration ###
Stylco is configured with a file called `.stylcorc` put in your project's document root. It must contain *valid JSON*.

Note that any value set in your file will override the default one *entirely*, including complex values such as `files`.


#### basedir ####
`string`, default: `"styl/"`

Root directory for styles components, relative to project root. All component paths in Stylco commands are relative to this directory.


#### file_ext ####
`string`, default: `".styl"`

File extension for preprocessor style files. You may change to `.less` or `.scss` if you prefer.


#### indexfile_id ####
`string`, default: `"i"`

[File identifier](#files) that represents component index file (root file that includes all other components file).


#### import_rule ####
`string`, default: `"@import"`

In Stylus, [you may use](http://stylus-lang.com/docs/import.html#require) `@require` instead.


#### import_with_ext ####
`boolean`, default: `false`

Outputs `@import 'foo/bar.less'` instead of `@import 'foo/bar'`.


#### append_to_buildfile ####
`boolean`, default: `false`

When creating `qux/foobar` component, also add import line (like `@import 'qux/foobar'`) into `qux.styl` buildfile. 
If `qux.styl` doesn't exist, it will be created.

Enable this option if you prefer buildfiles with explicitly listed components, or when using LESS (which doesn't support 
[import globbing](http://stylus-lang.com/docs/import.html#file-globbing) such as `@import 'qux/*'`.

Exact behavior is affected by **[buildfile_explicit_indexfile_import](#buildfile_explicit_indexfile_import)** option.


#### buildfile_explicit_indexfile_import ####
`boolean`, default: `false`

If set to `true`, **[append_to_buildfile](#append_to_buildfile)** imports [index file](#indexfile_id) explicitly 
(otherwise, component directory path is imported).

This option should be useful when using preprocessor *without* transparent index file imports 
(such as [`index.styl` in Stylus](http://stylus-lang.com/docs/import.html#stylus-import)).


#### allow_buildfile_outside_basedir ####
`boolean`, default: `false`

If false, skips writing import line (see **[append_to_buildfile](#append_to_buildfile)** option) if buildfile assumable location is outside **[basedir](#basedir)**.


#### use_semicolons ####
`boolean`, default: `false`

End lines with semicolons. If you use LESS or SCSS, that should be turned on.


#### quote ####
`string`, default: `"\""`

Quotes type (used basicly for imports). Default value stands for double-quote, that is: ```@import "mycomponent"```.

Slash escaping is only needed for reserving double-quotes around: `"\""` (to keep config valid JSON), and is not outputted.

If you prefer single-quotes, this escaping is not needed: `"'"`.


#### indent ####
`string`, default: `"  "` (two spaces)

Indentation unit in your codestyle. You may use any number of spaces or tabs if you prefer.


#### newline ####
`string`, default: `"\n"`

Newline char(s) in your code. May be changed to `"\r\n"` or even `"\r"` if you have really justifiable reasons for those.


#### ensure_trailing_newline ####
`boolean`, default: `true`

One more codestyle option. Preserving newline in the end of every file help to avoid strage diffs, for instance.


#### write_file_options ####
`string` or `object`, default: `"utf8"`

Passed to file write operations in NodeJS (refers to `options` param in [fs module doc](https://nodejs.org/api/fs.html#fs_fs_writefile_file_data_options_callback)).

You may set this in extended format (`mode` will be automatically converted from string to octal number):
```json
"file_write_options": {
        "encoding": "utf8",
        "mode": "0o644"
    }
```

Single string value (such as default one: `"utf8"`) represents just encoding.


#### virtual_component_prefix ####
`string` or `null`, default `null`

Consider component virtual if its name begins with specified prefix.

Virtual component is one that _produces no CSS output_, and only contains constants, mixins and/or functions.

For example, if you set this option to `"_"`, component `_typography` (as well as `mobile/_color`) is recognized as virtual.

For virtual components, [you can disable](#no_virtual) creating some of component files, or omit some sections inside them.

If option value is `null`, no virtual component recognition is made, and every component's files are generated by the same rules.


#### abstract_dir_prefix ####
`string` or `null`, default `null`

Consider component abstract if it is created inside directory with specified prefix in the name begin.

Abstract component is _not imported in any buildfile_, and is only used for as extend base for other components.

For example, if you set this option to `"_"`, component `foo` created with directory `_common` (i.e. `_oommon/foo`,
as well as `bar/_common/foo`) is recognized as virtual.

If option value is `null`, no abstract component recognition is made, and every component is appended to buildfile
(if [correspondent option](#append_to_buildfile) is enabled).


#### files ####
`object` containing `object`s

The most interesting and powerful option. With this you set which files should be created inside every component directory, and what would be their default content.

```javascript
{
    ".": { "filename": …, "imports": …, "import_extend_source": …, "content": …, "no_virtual": … },
    "m": { "filename": …, "imports": …, "import_extend_source": …, "content": …, "no_virtual": … },
    "c": { "filename": …, "imports": …, "import_extend_source": …, "content": …, "no_virtual": … }
}
```

Outer object key is the `string` **identifier of file kind**. Better keep it short (preferrable single char) but comprehensible (`m` for mixins, `.` for main file etc.).

Each key (identifier) refers to an object with the following keys:

##### filename #####
`string`.

Filename mask with `{{NAME}}` placeholder replaced with component name. E.g. `{{NAME}}__mixins` becomes `mycomponent__mixins`.

*Please don't add file extension here!* (use **[file_ext](#file_ext)** and/or **[import_with_ext](#import_with_ext)** options for handling file extensions).


##### imports #####
*(optional)* `string` or array of `string`s

Array of *file identifiers* (e.g., outer object keys) listing *other files from the same component* to be imported into this file. E.g., if you want to import constants and mixins, you may set it to `["c", "m"]`.

If there is only single file to be imported, array could be changed to single string, e.g. `"c"` for only constants to import.

If there are no other files to import, the key can be omitted.


##### import_extend_source #####
*(optional)* `boolean`

Set `true` if you want to import same-named file when extending from another component.

E.g. when using ```stylco mobile/button _base/button``` and setting the option `true` for constants file, you'll get additional ```@import '../_base/button/button__constants'``` line in your mobile `button__constants.styl` file. This import line will be placed first (on the very top of file).

If this options isn't needed for specific file, may be set `false` or omitted.


##### content #####
*(optional)* `string` or `null`

A template for any additional file content just after import lines.

The following placeholders supported:
* `{{NAME}}` — component name, e.g. `button`. Useful for generating default selector.
* `{{IMPORT}}` — `@import` or maybe `@require` rule, respecting **[import_rule](#import_rule)** option value.
* `{{SEMICOLON}}` — `;` or `""`(empty string), respecting **[use_semicolons](#use_semicolons)** option value.
* `{{QUOTE}}` — `"` or maybe `'`, respecting **[quote](#quote)** option value.
* `{{NEWLINE}}` — `\n` or maybe `\r\n` or `\r`, respecting **[newline](#newline)** option value.
* `{{INDENT}}` — `"  "` (two spaces) or maybe four spaces or one tab or whatever, respecting **[indent](#indent)** option value.

If you don't need any custom content for the file, set this value to `null` or just omit it.


##### no_virtual #####
*(optional)* `boolean` or `string` or array of `string`s, default `false`

Works in conjunction with **[virtual_component_prefix](#virtual_component_prefix)** option. _Only has any effect if this option is enabled **and** component recognized as virtual._

In that case, if `no_virtual` set to `true`, the current file isn't generated at all for the current component.

If set to string or string array, the file is created, but with correspondent sections ignored and skipped for virtual component:
* For example, `"no_virtual": "content"` skips [custom content](#content) outputting for the current file, but keeps two other sections: [imports](#imports) and [import_extend_source](#import_extend_source).
* And with value `"no_virtual": ["imports", "import_extend_source"]`, both import blocks are ignored, but content block is still generated (if any is set).

If `no_virtual` value set to `false` or omitted, no special rules apply on this file creation and/or content, regardless of whether component is virtual or not.


#### All default values together ####
Here are default configuration values for Stylco. You can override any of them with a file called `.stylcorc` put in your project's document root (must be valid JSON). Note that any value set in your file overrides default key entirely.
```json
{
    "basedir": "styl/",
    "file_ext": ".styl",
    "indexfile_id": "i",
    "import_rule": "@import",
    "import_with_ext": false,
    "append_to_buildfile": false,
    "buildfile_explicit_indexfile_import": false,
    "allow_buildfile_outside_basedir": false,
    "use_semicolons": false,
    "quote": "\"",
    "indent": "  ",
    "newline": "\n",
    "ensure_trailing_newline": true,
    "file_write_options": "utf8",
    "virtual_component_prefix": null,
    "abstract_dir_prefix": null,
    "files": {
        ".": {
            "filename": "{{NAME}}",
            "imports": ["_"],
            "import_extend_source": true,
            "content": "{{NEWLINE}}.{{NAME}}{{NEWLINE}}{{INDENT}}// your code here",
            "no_virtual": true
        },
        "c": {
            "filename": "{{NAME}}__constants",
            "imports": [],
            "import_extend_source": true,
            "content": null,
            "no_virtual": false
        },
        "m": {
            "filename": "{{NAME}}__mixins",
            "imports": ["c"],
            "import_extend_source": true,
            "content": null,
            "no_virtual": false
        },
        "_": {
            "filename": "__",
            "imports": ["c", "m"],
            "import_extend_source": false,
            "content": null,
            "no_virtual": false
        },
        "i": {
            "filename": "index",
            "imports": ["_", "."],
            "import_extend_source": false,
            "content": null,
            "no_virtual": false
        }
    }
}
```

## FAQ / TODO ##

### What are those \__.styl needed for? ###
Stylus misses very useful LESS's feature — [reference import](http://lesscss.org/features/#import-options). It allows importing variables and mixins without outputting any CSS code.

In my concept, `__.styl` only holds constants and mixins imports, so LESS's reference import may be somehow emulated in Stylus with simple line: ```@import path/to/mycomponent/__```.

### Why no codestyle option for curly braces and colons? ###
Neither curly braces nor colons are used in import constructs in any way, so for now that could be enough to add them to **[content](#content)** templates manually.

### Does buildfile appending option support recursive "bubbling"? ###
For now, negative. Only immediate parent level buildfile is being **[updated or created](#append_to_buildfile)**. In future this limit may be eliminated.

### A command for batch adding many components? ###
Working on it.

### Is it possible to create file in subdirectory of component directory? ###
Yes, use filename similar to `"subdir/{{NAME}}"`.

### Is it possible to create file outside component directory? ###
Yes, just make the filename similar to `"../{{NAME}}"`.

There are some things to reconsider, but also working on it.

### Why there is only adding, not deleting components with a simple command? ###
Adding new structure, you don't break things down. Deleting existing structure with simple command is dangerous. Please do that *manually*.


### Version history ###

* **0.1.6** *(2016-10-21)*:
  * Support abstract components which are never added to buildfile (with **[abstract_dir_prefix](#abstract_dir_prefix)** option)
* **0.1.5** *(2016-10-17)*:
  * Support explicit index file import (with **[buildfile_explicit_indexfile_import](#buildfile_explicit_indexfile_import)** option)
* **0.1.4** *(2016-03-17)*:
  * Allow creating file inside subdir of component directory (credits to @garyanikin)
* **0.1.3** *(2016-02-21)*:
  * Added support for virtual components (i.e. producing no CSS output); see **[virtual_component_prefix](#virtual_component_prefix)** and **[no_virtual](#no_virtual)** options
  * Minor doc improvements
* **0.1.2** *(2016-02-18)*:
  * Fixed incorrect relative paths to component extending from
  * Fixed relative paths handling (style files outside component directory)
* **0.1.1** *(2016-02-16)*:
  * Fixed incorrect behavior of **[import_with_ext](#import_with_ext)** option when appending to buildfile
  * Changed *default* config values for the following options (you can override any with `.stylcorc` file in your project root):
    * **[append_to_buildfile](#import_with_ext)** (now `false` by default, as using Stylus's [import globbing](http://stylus-lang.com/docs/import.html#file-globbing) is more handy)
    * **[indent](#indent)** (now two spaces by default as it is more widespread with Stylus)
    * **[quote](#quote)** (now double-quote by default as it is more common pattern in Stylus/LESS world)
    * **[file_write_options](#file_write_options)** (removed `mode`, leaving only `utf8` in default value)
  * Minor fixes and doc updates
* **0.1.0** *(2016-02-15)*: Initial release
