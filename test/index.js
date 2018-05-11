const path = require('path'),
    Moment = require('moment'),
    fs = require('fs'),
    { google } = require('googleapis');

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
    driveWrapper = null;


lab.experiment("Google API ", {}, () => {

    lab.before( () => {
        return new Promise( (resolve,reject) => {
            require('oauth-token-generator-google')(googleAuthCredentials).then( _auth => {
                let wrapper = require('../lib/gdriveWrapper.js');
                driveWrapper = new wrapper( _auth, google);
                auth = _auth;
                resolve();
            }).catch(err => { console.dir(err) });
        })
    });

    lab.test("confirm credentials using Drive filelist", { timeout: 5000 }, () => {

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

    lab.test(" uploading /uploadTest.txt", { timeout: 10000 }, () => {

        return new Promise((resolve, reject) => {
            let uploadFile = path.normalize(path.join(__dirname, 'uploadTest.txt'));
            expect(fs.existsSync(uploadFile)).to.be.true();
            expect( driveWrapper ).to.be.an.object();
            driveWrapper.uploadFile('uploadTest.txt', uploadFile, { resource: { description: 'Google API uploadTest.txt test' }, properties: { testProp: "testValue" } })
                .then(file => {
                    expect(file.id).to.exist();
                    expect(file.name).to.equal('uploadTest.txt');
                    resolve();
                }).catch(err => {
                    expect(err).to.be.null();
                });
        });

    }); // End Test

    lab.test("confirm uploadTest.txt", { timeout: 10000 }, () => {

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
        //expect(true).to.be.true;
    }); // End Test

}); // End Experiment "Google API "