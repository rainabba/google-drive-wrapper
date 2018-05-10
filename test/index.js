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
    auth = null;

require('oauth-token-generator-google')(googleAuthCredentials).then(_auth => { auth = _auth; }).catch(err => { console.dir(err) });

lab.experiment("Google API ", {}, () => {

    lab.test("confirm credentials using Drive filelist", { timeout: 5000 }, () => {

        return new Promise((resolve, reject) => {
            const service = google.drive('v3');
            service.files.list({
                auth: auth,
                pageSize: 10,
                fields: 'nextPageToken, files(id, name)'
            }, (err, res) => {
                if (err) {
                    console.error('The API returned an error.');
                    console.dir(err);
                    reject(err);
                }
                expect(res.data.files).to.be.an.array();
                expect(res.data.files.length).to.be.greaterThan(0);
                resolve();
            });
        });

    }); // End Test

    lab.test(" uploading /uploadTest.txt", { timeout: 10000 }, () => {

        return new Promise((resolve, reject) => {
            let gdriveWrapper = require('../lib/gdriveWrapper.js'),
                wrapper = new gdriveWrapper(auth, google),
                uploadFile = path.normalize(path.join(__dirname, 'uploadTest.txt'));
            expect(fs.existsSync(uploadFile)).to.be.true();
            wrapper.uploadFile('uploadTest.txt', uploadFile, { resource: { description: 'Google API uploadTest.txt test' }, properties: { testProp: "testValue" } })
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
            let gdriveWrapper = require('../lib/gdriveWrapper.js');
            let wrapper = new gdriveWrapper(auth, google);
            wrapper.getMetaForFilename('/uploadTest.txt')
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