const path = require('path'),
    Moment = require('moment'),
    fs = require('fs'),
    {google} = require('googleapis');

// ./private/client_secret.json must exist before using this

let googleAuthCredentials = path.normalize(path.join(__dirname, '../private/client_secret.json')),
    google_client_creds_folder = path.dirname(googleAuthCredentials),
    google_client_secret_file = path.basename(googleAuthCredentials).replace(/\.json$/g, ""),
    google_client_token_file = path.basename(google_client_secret_file.replace(/\.json$/g, '') + '.token'),
    Code = require('code'),
    Lab = require('lab'),
    lab = exports.lab = Lab.script(),
    describe = lab.describe,
    it = lab.it,
    before = lab.before,
    after = lab.after,
    expect = Code.expect,
    server = null,
    auth = null;

require('oauth-token-generator-google')(googleAuthCredentials).then( _auth => { auth = _auth; } ).catch( err => { console.dir( err ) } );

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

    lab.test(" uploading /uploadTest.txt", { timeout: 5000 }, () => {

        return new Promise((resolve, reject) => {
                let gdriveWrapper = require('../lib/gdriveWrapper.js'),
                    wrapper = new gdriveWrapper(auth, google),
                    uploadFile = path.normalize(path.join(__dirname, 'uploadTest.txt'));
                    expect( fs.existsSync(uploadFile) ).to.be.true();
                    if (fs.existsSync(uploadFile)) {
                        wrapper.uploadFile('uploadTest.txt', uploadFile, { },
                        function( err, file ) {
                            expect( err ).to.be.null();
                            expect( file.id ).to.exist();
                            expect( file.name ).to.equal( "uploadTest.txt" );
                            resolve();
                        });
                    } else {
                        console.log("uploadTest.txt not found:", uploadFile);
                        reject( "uploadTest.txt not found:", uploadFile );
                    }

        });
    }); // End Test

    lab.test("confirm uploadTest.txt", { timeout: 5000 }, () => {

        return new Promise((resolve, reject) => {
                let gdriveWrapper = require('../lib/gdriveWrapper.js');
                let wrapper = new gdriveWrapper(auth, google);
                wrapper.getMetaForFilename('/uploadTest.txt', function( err, file ) {
                    expect( err ).to.be.null();
                    expect( file ).to.be.an.object();
                    expect( file.id ).to.exist();
                    expect( file.name ).to.equal( "uploadTest.txt" );
                    resolve();
                });
        });
        //expect(true).to.be.true;
    }); // End Test

}); // End Experiment "Google API "
