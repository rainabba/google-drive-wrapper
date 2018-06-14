const path = require('path'),
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
    drive = null,
    testFolderA = '/test-' + uuidv4(),
    testFolderB = '/test-' + uuidv4(),
    testFolderC = '/test-' + uuidv4(),
    moment = require('moment');


lab.experiment("Google API ", {}, () => {

    lab.before( () => {
        return new Promise( (resolve,reject) => {
            require('oauth-token-generator-google')(googleAuthCredentials).then( _auth => {
                expect( _auth ).to.be.an.object();
                drive = require('../lib/').Drive( _auth, google);
                expect( drive ).to.be.an.object();
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
            expect( drive ).to.be.an.object();
            drive.mkdir( testFolderA )
                .then( folder => {
                    expect(folder).to.be.an.object();
                    expect(folder.id).to.exist();
                    let folderParts = drive.pathSplit( testFolderA );
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
            expect( drive ).to.be.an.object();
            drive.mkdirp( testFolderA + testFolderB )
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
            expect( drive ).to.be.an.object();

            drive.getMetaForFilename( testFolderA + testFolderB )
                .then( folder => {
                    drive.uploadFile('uploadTest.txt', uploadFile, { keepFileAfterUpload: true, resource: { parents: [ folder.id ], description: 'Google API uploadTest.txt test' }, properties: { testProp: "testValue" } })
                        .then( file => {
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

    lab.test("Update uploadTest.txt to Drive " + testFolderA + testFolderB, { timeout: 10000 }, () => {

        return new Promise((resolve, reject) => {
            let uploadFile = path.normalize(path.join(__dirname, 'uploadTest.txt'));
            expect(fs.existsSync(uploadFile)).to.be.true();
            expect( drive ).to.be.an.object();

            drive.getMetaForFilename( testFolderA + testFolderB )
                .then( folder => {
                    drive.uploadFile('uploadTest.txt', uploadFile, { keepFileAfterUpload: true, resource: { parents: [ folder.id ], description: 'Google API uploadTest.txt test' }, properties: { testProp: "testValue" } })
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
            expect( drive ).to.be.an.object();
            drive.getMetaForFilename('/uploadTest.txt')
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
            expect( drive ).to.be.an.object();
            //This upload doesn't provide parents and DOES use a full drive path with filename so uploadFile will check for the parent folder, create it and then upload
            drive.uploadFile( testFolderA + testFolderB + testFolderC + '/uploadTest.txt',
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

    lab.test("Update uploadTest.txt to Drive " + testFolderA + testFolderB, { timeout: 10000 }, () => {

        return new Promise((resolve, reject) => {
            let uploadFile = path.normalize(path.join(__dirname, 'uploadTest.txt'));
            expect(fs.existsSync(uploadFile)).to.be.true();
            expect( drive ).to.be.an.object();

            drive.getMetaForFilename( testFolderA + testFolderB )
                .then( folder => {
                    drive.uploadFile('uploadTest.txt', uploadFile, { keepFileAfterUpload: true, resource: { parents: [ folder.id ], description: 'Google API uploadTest.txt test' }, properties: { testProp: "testValue" } })
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

    lab.test("move uploadTest.txt to a parent folder and rename " + testFolderA + testFolderB, { timeout: 12000 }, () => {

        return new Promise((resolve, reject) => {
            let srcFilePath = path.join(testFolderA, testFolderB, testFolderC, 'uploadTest.txt'),
                dstFilePath = path.join(testFolderA, '/uploadTestMoved.txt');
            expect(drive).to.be.an.object();

            drive.mv( srcFilePath, dstFilePath)
                .then(results => {
                    drive.getMetaForFilename(  dstFilePath )
                        .then( movedFile => {
                            expect( movedFile ).to.be.an.object(); //This fails right now because we can't successfully rename files on Drive
                            expect( movedFile.name ).to.equal( path.basename(dstFilePath) );
                            resolve();
                        })
                        .catch(err => {
                            debugger;
                            reject(err);
                            expect(err).to.be.null();
                        });
                })
                .catch(err => {
                    console.error(err);
                    debugger;
                    expect(err).to.be.null();
                });

        });
    }); // End Test

    lab.test("Make file publicly sharable for 48 hours " + testFolderA + '/uploadTestMoved.txt' , { timeout: 12000 }, () => {
        return new Promise((resolve, reject) => {
            let srcFilePath = path.join(testFolderA, '/uploadTestMoved.txt');
            drive.getMetaForFilename(srcFilePath)
                .then( file => {
                    if ( !file || !file.id ) { reject( {} ) }
                    expect( file.id.length > 32 ).to.be.a.true();
                    drive.permissions.create(
                        file.id, [{
                            'type': 'anyone',
                            'role': 'reader',
                            'allowFileDiscovery': false,
                            'expirationTime': moment().add({ hours: 48 })._d
                        }])
                        .then( res => {
                            expect( res.permissions.length == 1 ).to.be.true();
                            expect( res.Id == file.id ).to.be.true();
                            resolve();
                        })
                        .catch(err => {
                            console.error(err);
                            debugger;
                            expect(err).to.be.null();
                        });
                })
                .catch(err => {
                    console.error(err)
                    debugger;
                    expect(err).to.be.null();
                });
        });
    }); // End Test

}); // End Experiment "Google API "

    testFolderA = '/test-701afbd5-a750-46d3-987d-a12b65f7db29'

lab.experiment.skip("DEVELOPMENT: ", { timeout: 500000 }, () => {

    lab.before( () => {
        return new Promise( (resolve,reject) => {
            require('oauth-token-generator-google')(googleAuthCredentials).then( _auth => {
                drive = require('../lib/').Drive( _auth, google);
                auth = _auth;
                resolve();
            })
            .catch(err => { console.error(err); debugger; });
        })
    });

}); // End Development Space