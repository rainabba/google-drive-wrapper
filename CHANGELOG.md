### 0.7.0 ( 2018-05-10 )

Features
	- Promisify all public methods in the library
	- Update googleapis to v29.0.0
	- Added tests to confirm some of the functionality - Lots more tests needed

### 0.8.0 ( )

Note:
	BREAKING CHANGES - this would be a major version increment IF it was
	released. If you were using a prior version, you will want to see test/index.js
	and make note of where promises are now used and how to call the
	constructor.

Fix:
	- Add more error checking and handling in constructor
	- Address memory leak with fileComponents object

Features
	- Fully reworked tests