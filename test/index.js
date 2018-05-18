const path = require('path'),
    Moment = require('moment'),
    fs = require('fs'),
    { google } = require('googleapis'),
    uuidv4 = require('uuid/v4');

// ./private/client_secret.json must exist before using this

let Code = require('code'),
    Lab = require('lab'),
    lab = exports.lab = Lab.script(),
    describe = lab.describe,
    it = lab.it,
    before = lab.before,
    after = lab.after,
    expect = Code.expect,
    server = null,
    googleAuthCredentials = path.normalize(path.join(__dirname, '../private/client_secret.json')),
    auth = null,
    driveWrapper = null,
    testFolderA = '/test-' + uuidv4(),
    testFolderB = '/test-' + uuidv4(),
    testFolderC = '/test-' + uuidv4();


lab.experiment("Google API ", {}, () => {

    lab.before( () => {
        return new Promise( (resolve,reject) => {
            require('oauth-token-generator-google')(googleAuthCredentials).then( _auth => {
                let wrapper = require('../lib/');
                driveWrapper = new wrapper( _auth, google);
                auth = _auth;
                resolve();
            }).catch(err => { 
                console.error(err);
                debugger;
                reject( err );
            });
        })
    });

    lab.test("Confirm oauth token using Drive filelist", { timeout: 5000 }, () => {

        return new Promise((resolve, reject) => {
            const service = google.drive('v3');
            service.files.list({
                auth: auth,
                pageSize: 10,
                fields: 'nextPageToken, files(id, name)'
            }, ( err, res ) => {
                if (err) {
                    console.error('The API returned an error.');
                    console.dir(err);
                    debugger;
                    reject(err);
                }
                expect(res).to.be.an.object();
                expect(res.data).to.be.an.object();
                expect(res.data.files).to.be.an.array();
                expect(res.data.files.length).to.be.greaterThan(0);
                resolve();
            });
        });
    }); // End Test

    lab.test("confirm mkdir creates non-existing folder at root", { timeout: 1000000 }, () => {
        return new Promise((resolve, reject) => {
            expect( driveWrapper ).to.be.an.object();
            driveWrapper.mkdir( testFolderA )
                .then( folder => {
                    expect(folder).to.be.an.object();
                    expect(folder.id).to.exist();
                    let folderParts = driveWrapper.pathSplit( testFolderA );
                    expect( folder.name.toLowerCase() ).to.equal( folderParts[ folderParts.length -1 ].toLowerCase().replace(/^\//g,'') );
                    resolve();
                }).catch(err => {
                    console.error(err);
                    debugger;
                    expect(err).to.be.null();
                });
        });
    }); // End Test

    lab.test("confirm mkdirp creates non-existing folder structure at least 2 levels past what we know will exist.", { timeout: 1000000 }, () => {
        return new Promise((resolve, reject) => {
            expect( driveWrapper ).to.be.an.object();
            driveWrapper.mkdirp( testFolderA + testFolderB )
                .then( folder => {
                    expect(folder).to.be.an.object();
                    expect(folder.id).to.exist();
                    expect( folder.name.toLowerCase() ).to.equal( testFolderB.toLowerCase().replace(/^\//g,'') );
                    resolve();
                }).catch(err => {
                    console.error(err);
                    debugger;
                    expect(err).to.be.null();
                });
        });
        //expect(true).to.be.true;
    }); // End Test

    lab.test("Upload uploadTest.txt to Drive " + testFolderA + testFolderB, { timeout: 10000 }, () => {

        return new Promise((resolve, reject) => {
            let uploadFile = path.normalize(path.join(__dirname, 'uploadTest.txt'));
            expect(fs.existsSync(uploadFile)).to.be.true();
            expect( driveWrapper ).to.be.an.object();

            driveWrapper.getMetaForFilename( testFolderA + testFolderB )
                .then( folder => {
                    driveWrapper.uploadFile('uploadTest.txt', uploadFile, { keepFileAfterUpload: true, resource: { parents: [ folder.id ], description: 'Google API uploadTest.txt test' }, properties: { testProp: "testValue" } })
                        .then(file => {
                            expect(file.id).to.exist();
                            expect(file.name).to.equal('uploadTest.txt');
                            resolve();
                        }).catch(err => {
                            console.error(err);
                            debugger;
                            expect(err).to.be.null();
                        });
                }).catch( err => {
                    console.error(err);
                    debugger;
                    reject( err );
                });

        });
    }); // End Test

    lab.test("Confirm upload of " + testFolderA + testFolderB + "/uploadTest.txt", { timeout: 10000 }, () => {
        return new Promise((resolve, reject) => {
            expect( driveWrapper ).to.be.an.object();
            driveWrapper.getMetaForFilename('/uploadTest.txt')
                .then(file => {
                    expect(file).to.be.an.object();
                    expect(file.id).to.exist();
                    expect(file.name).to.equal('uploadTest.txt');
                    resolve();
                }).catch(err => {
                    expect(err).to.be.null();
                });
        });
    }); // End Test

    lab.test("Test auto mkdirp in upload uploadText.txt to Drive " + testFolderA + testFolderB + testFolderC, { timeout: 100000 }, () => {

        return new Promise((resolve, reject) => {
            let uploadFile = path.normalize(path.join(__dirname, 'uploadTest.txt'));
            expect(fs.existsSync(uploadFile)).to.be.true();
            expect( driveWrapper ).to.be.an.object();
            //This upload doesn't provide parents and DOES use a full drive path with filename so uploadFile will check for the parent folder, create it and then upload
            driveWrapper.uploadFile( testFolderA + testFolderB + testFolderC + '/uploadTest.txt',
                uploadFile,
                { keepFileAfterUpload: true, resource: { description: 'Google API uploadTest.txt test' }, properties: { testProp: "testValue" } })
                .then(file => {
                    expect(file.id).to.exist();
                    expect(file.name).to.equal('uploadTest.txt');
                    resolve();
                }).catch(err => {
                    console.error(err);
                    debugger;
                    expect(err).to.be.null();
                });

        });
    }); // End Test

}); // End Experiment "Google API "


lab.experiment.skip("DEVELOPMENT: ", {}, () => {

    lab.before( () => {
        return new Promise( (resolve,reject) => {
            require('oauth-token-generator-google')(googleAuthCredentials).then( _auth => {
                let wrapper = require('../lib/');
                driveWrapper = new wrapper( _auth, google);
                auth = _auth;
                resolve();
            })
            .catch(err => { console.error(err); debugger; });
        })
    });

}); // End Development Space