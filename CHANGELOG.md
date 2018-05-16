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
