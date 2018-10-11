### 1.0.7 ( 2018-10-11 )

Feature
	- Added throttling with promise-ratelimit. Also added an options object which takes 'throttle' to customize the default 2000ms throttle rate.

### 1.0.6 ( 2018-10-11 )

Feature
	- Added more caching to further reduce API calls

### 1.0.5 ( 2018-10-10 )

Feature
	- Added caching using node-cache to speed things up and reduce API calls out. Caching is based on the calculated query so should be deterministic for a given path/filename.ext

Change
	- Updated dependencies to: googleapis@34.0.0 and lab@16.1.0 dependencies

### 1.0.4 ( 2018-06-14  )

Fix
	- Results from permissions.create() included "Id" instead of "id". Fixed and test updated (test was flawed also).

### 1.0.3 ( 2018-06-14  )

Change
	- More README.md tweaks

### 1.0.2 ( 2018-06-14  )

Change
	- More README.md cleanup and testing update/npm for future clarify

### 1.0.1 ( 2018-06-14  )

Change
	- Cleanup README.md after publishing to NPM

### 1.0.0 ( 2018-06-14  )

Feature
	- Added the ability to create permissions ( an array of individual permission sets ) by FileId

Change
	- Refactored and updated references/repos to release as node-cloudfs-drive with future thoughts on node-cloudfs-s3 and such
	- Fully updated, tested and shrinkwrapped
	- Will register with NPM after push

### 0.9.3 ( 2018-05-25 )

Feature
	- Added mv() functionality that is somewhat primitive, but takes a sourcePath and destinationPath which both must be full paths (including filename)

Fix
	- Minor bug fixes and hardening

Change
	- Name change to reflect intent to expand library to other major cloud services
	- MAJOR change is object structure for constuctor to allow for other cloud services

### 0.9.2 ( 2018-05-22 )

Feature
	- uploadFile has been enhanced to support Drive versioning by calling update() instead of uploading a 2nd file with the same name when an existing file is detected.

### 0.9.1 ( 2018-05-16 )

Fix
	- Update main in package.json to reflect new lib/index.js filename

### 0.9.0 ( 2018-05-16 )

Features
	- Substantial refactoring to further improve error catching and reprting as well as further promisify code, including calls to Google API methods
	- Added mkdir() method which takes a foldername and optionally a parentid then returns the Drive folder object
	- Added mkdirp() method which will create missing folders starting from root
	- More refactoring, standardizing use of "semantic this" and more promisifying calls
	- More tests for new methods
	- Enhanced uploadFile so that a full path can be provided and mkdirp will ensure the path exists before upload

Note
	MORE BREAKING CHANGES - this would be a major version increment IF .... I think I'll release 1.0.0 soon or on the next update, which ever is first.

### 0.8.0 ( 2018-05-11 )

Note
	BREAKING CHANGES - this would be a major version increment IF it was
	released. If you were using a prior version, you will want to see test/index.js
	and make note of where promises are now used and how to call the
	constructor.

Fix
	- Add more error checking and handling in constructor
	- Address memory leak with fileComponents object

Features
	- Fully reworked tests

### 0.7.0 ( 2018-05-10 )

Features
	- Promisify all public methods in the library
	- Update googleapis to v29.0.0
	- Added tests to confirm some of the functionality - Lots more tests needed
