// Copyright 2016 the project authors as listed in the AUTHORS file.
// All rights reserved. Use of this source code is governed by the
// license that can be found in the LICENSE file.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const mimetype = require('mime-types');

function gdriveWrapper(auth, google, password) {
    this.drive = google.drive({ version: 'v3', auth: auth });
    this.password = password;
}

gdriveWrapper.prototype.getFileMetadata = function(fileId, complete) {
    return new Promise( (resolve, reject ) => {
        output = this.drive.files.get({ fileId: fileId }, complete);
    });
    
}

gdriveWrapper.prototype.uploadFile = function(filename, sourceFile, options, complete) {
    return new Promise((resolve, reject) => {
        var extension = '';
        // common error handler for pipes
        var errorOccurred = false;
        var handlePipeError = function(err) {
            if (!errorOccurred) {
                errorOccurred = true;
                reject({ error: err, sourceFile: sourceFile });
            }
        };

        var mimeType = 'application/octet-stream';
        if (typeof sourceFile === 'string') {
            var uploadStream = fs.createReadStream(sourceFile);
            mimeType = mimetype.lookup(sourceFile.substring(filename.indexOf('.')));
            if (mimeType === false) {
                mimeType = 'application/octet-stream';
            }
        } else {
            uploadStream = sourceFile;
        }
        uploadStream.on('error', handlePipeError);

        if (options.compress === true) {
            var zip = zlib.createGzip();
            uploadStream = uploadStream.pipe(zip);
            uploadStream.on('error', handlePipeError);
            extension = '.gz';
        }

        if (options.encrypt === true) {
            var enc = crypto.createCipher('aes-256-cbc', this.password);
            uploadStream = uploadStream.pipe(enc);
            uploadStream.on('error', handlePipeError);
            extension = extension + '.enc';
        }

        // this is to support converting a file to a google doc
        var convertOnUpload = false;
        var uploadMimeType = mimeType;
        if (options.convert === true) {
            // this is for importing google docs
            convertOnUpload = true;
            if (options.mimeType) {
                uploadMimeType = options.mimeType;
            }
        }
        let newFile = {
            resource: options.resource || {},
            media: {
                mimeType: mimeType,
                body: uploadStream
            },
            fields: 'id,name,size,parents,properties'
        }
        newFile.resource.name = filename + extension;
        newFile.resource.parents = newFile.resource.parents || options.parents; // For backward compatibility
        newFile.resource.spaces = 'drive';
        newFile.resource.mimeType = uploadMimeType;
        newFile.resource.convert = convertOnUpload;
        newFile.resource.originalFilename = path.basename( sourceFile );

        this.drive.files.create(newFile, (err, response) => {
            if (!err && response.status == "200") {
                resolve(response.data);
            } else {
                console.dir(err);
                reject({ error: err || "Error uploading file from gdriveWrapper.uploadFile()", response: response });
            }
        });
    });
}

gdriveWrapper.prototype.downloadFile = function(fileId, destFilename, complete) {
    return new Promise((resolve, reject) => {
        const wrapperThis = this;
        var extension = '';
        this.getFileMetadata(fileId, function(err, meta) {
            var output = wrapperThis.drive.files.get({ fileId: fileId, alt: 'media' }, function() {
                // do nothing but we need this to avoid console output
                // in error conditions
            });

            // common error handler for pipes
            var errorOccurred = false;
            var handlePipeError = function(err) {
                if (!errorOccurred) {
                    errorOccurred = true;
                    reject({ error: err, destFilename: destFilename });
                }
            };

            var requestOutput = output;
            output.on('error', handlePipeError);
            output.on('end', function() {
                // make sure we process any error event first
                setImmediate(function() {
                    if (!errorOccurred) {
                        if (requestOutput.response.data.statusCode != 200) {
                            reject({ error: "Status code was :" + requestOutput.response.data.statusCode, errorMessage: requestOutput.response.data.statusMessage, destFilename: destFilename });
                        } else {
                            resolve(meta);
                        }
                    }
                });
            });

            var name = meta.name;
            var lastExtension = name.substring(name.lastIndexOf('.'));
            if (lastExtension === '.enc') {
                var dec = crypto.createDecipher('aes-256-cbc', wrapperThis.password);
                output = output.pipe(dec);
                output.on('error', handlePipeError);
                name = name.substring(0, name.lastIndexOf('.'));
            }

            var lastExtension = name.substring(name.lastIndexOf('.'));
            if (lastExtension === '.gz') {
                var unzip = zlib.createGunzip();
                output = output.pipe(unzip);
                output.on('error', handlePipeError);
            }

            var outputFile = fs.createWriteStream(destFilename);
            output.pipe(outputFile);
        });
    });
}

// must start at root
gdriveWrapper.prototype.getMetaForFilename = function(filename, complete) {
    return new Promise((resolve, reject) => {
        const wrapperThis = this;

        if (filename[0] === '/') {
            filename = filename.substring(1);
        }
        fileComponents = filename.split('/');

        var findNext = function(parent, fileComponents, index) {
            var query = 'name = \'' + fileComponents[index] + '\'';
            if (parent !== null) {
                query = query + ' and \'' + parent + '\' in parents' + ' and trashed != true';
            }
            wrapperThis.drive.files.list({
                    spaces: 'drive',
                    pageSize: 10,
                    q: query
                },
                function(err, response) {
                    if (err !== null) {
                        reject(err);
                    }
                    if (!response.data.files.length || response.data.files.length == 0) {
                        reject({ error: 'File component not found:' + fileComponents[index] });
                    }
                    if (index < (fileComponents.length - 1)) {
                        index = index + 1;
                        findNext(response.data.files[0].id, fileComponents, index);
                    } else {
                        resolve(response.data.files[0]);
                    }
                }
            );
        }

        findNext(null, fileComponents, 0);
    });
}

gdriveWrapper.prototype.downloadNewFiles = function(gdriveDirectory, targetDirectory, complete) {
    return new Promise((resolve, reject) => {
        const wrapperThis = this;

        // get list of existing files so we only download new files
        var existingFileName = path.join(targetDirectory, '.existing');
        var existingFiles = new Array();
        var fileLookup = new Object();
        try {
            var existingFiles = fs.readFileSync(existingFileName).toString().split(',');
            for (var i = 0; i < existingFiles.length; i++) {
                fileLookup[existingFiles[i]] = true;
            }
        } catch (err) {
            // ENOENT (-2) is ok as we just don't have a list of existing files yet
            if (err.errno !== -2) {
                reject({ error: err });
            }
        }

        this.getMetaForFilename(gdriveDirectory, function(err, parentMeta) {
            if (err) {
                reject(err);
            }
            var getNextFile = function(nextPageToken) {
                wrapperThis.drive.files.list({
                        pageSize: 2,
                        pageToken: nextPageToken,
                        q: '\'' + parentMeta.id + '\' in parents' + ' and trashed != true' +
                            ' and mimeType != \'application/vnd.google-apps.folder\'',
                        space: 'drive'
                    },
                    function(err, response) {
                        if (err) {
                            reject({ error: err, response: response });
                        }
                        var files = response.data.files;
                        if (files.length === 0) {
                            reject({ error: "file not found", response: response });
                        }

                        var filesBeingDownloaded = 0;
                        var checkGetNextFiles = function() {
                            if ((filesBeingDownloaded == 0) && (response.data.nextPageToken)) {
                                getNextFile(response.data.nextPageToken);
                            }
                        }

                        for (var i = 0; i < files.length; i++) {
                            var file = files[i];
                            if (fileLookup[file.id] !== true) {
                                // need to download
                                filesBeingDownloaded++;

                                // strip off the extenstion names that will be removed automatically
                                // as the file is decrypted/decompressed if appropriate
                                var targetFileName = file.name
                                var lastExtension = targetFileName.substring(targetFileName.lastIndexOf('.'));
                                if (lastExtension === '.enc') {
                                    targetFileName = targetFileName.substring(0, targetFileName.lastIndexOf('.'));
                                }
                                lastExtension = targetFileName.substring(targetFileName.lastIndexOf('.'));
                                if (lastExtension === '.gz') {
                                    targetFileName = targetFileName.substring(0, targetFileName.lastIndexOf('.'));
                                }

                                wrapperThis.downloadFile(file.id, path.join(targetDirectory, file.id + '-' + targetFileName), function(err, meta, targetFile) {
                                    if (!err) {
                                        try {
                                            fs.appendFileSync(existingFileName, ',' + meta.id);
                                            filesBeingDownloaded--;
                                            checkGetNextFiles();
                                        } catch (err) {
                                            reject({ error: 'Failed to append to existing file list' });
                                        }
                                    } else {
                                        // remove paritally written file if it exists
                                        fs.unlink(targetFile, function() {
                                            // do nothing on error
                                        });
                                        if (err) {
                                            reject({ error: err });
                                        } else {
                                            resolve(targetFile);
                                        }
                                    }
                                });
                            }
                        }
                        checkGetNextFiles();
                    }
                );
            }

            // ok now start by getting the first page
            getNextFile(null);
        });
    });
}

gdriveWrapper.prototype.uploadNewFiles = function(gdriveDirectory, sourceDirectory, moveTo, complete) {
    return new Promise((resolve, reject) => {
        const wrapperThis = this;
        let completedFiles = [];
        this.getMetaForFilename(gdriveDirectory, function(err, parentMeta) {
            if (err) {
                reject({ error: err });
            }
            fs.readdir(sourceDirectory, function(err, files) {
                if (err) {
                    reject({ error: err, sourceDirectory: sourceDirectory });
                }

                if (files.length === 0) {
                    // no files to upload so just end
                    reject({ error: "No files found to upload", sourceDirectory: sourceDirectory });
                }

                var index = 0;
                var uploadNextFile = function(index) {
                    var fileName = path.join(sourceDirectory, files[index]);
                    var movetoName = path.join(moveTo, files[index]);
                    if (fs.statSync(fileName).isFile()) {
                        completedFiles.push({ index: index, targetFileName: files[index], sourceFile: fileName, resource: { parent: parentMeta.id, compress: false, encrypt: false } });
                        wrapperThis.uploadFile(files[index],
                            fileName, { parent: parentMeta.id, compress: false, encrypt: false },
                            function(err, meta) {
                                if (err) {
                                    reject({ error: err });
                                }
                                fs.rename(fileName, movetoName, function(err) {
                                    if (err) {
                                        reject({ error: err });
                                    }
                                    index++;
                                    if (index < files.length) {
                                        uploadNextFile(index);
                                    }
                                });
                            });
                    }
                }

                // start uploading the files
                uploadNextFile(0);
                resolve(completedFiles);
            });
        });
    });
}

gdriveWrapper.prototype.listFilesBypath = function(gdriveDirectory, complete) {
    return new Promise((resolve, reject) => {
        const wrapperThis = this;
        this.getMetaForFilename(gdriveDirectory, function(err, parentMeta) {
            if (err) {
                reject({ error: err });
            }

            var fileList = new Array();
            var getNextFile = function(nextPageToken) {
                wrapperThis.drive.files.list({
                        pageSize: 20,
                        pageToken: nextPageToken,
                        q: '\'' + parentMeta.id + '\' in parents' + ' and trashed != true' +
                            ' and mimeType != \'application/vnd.google-apps.folder\'',
                        space: 'drive'
                    },
                    function(err, response) {
                        if (err) {
                            reject({ error: err });
                        }
                        var files = response.data.files;
                        if (files.length === 0) {
                            resolve(fileList);
                        }

                        fileList = fileList.concat(files);

                        if (response.data.nextPageToken) {
                            getNextFile(response.data.nextPageToken);
                        } else {
                            resolve(fileList);
                        }
                    }
                );
            }

            // ok now start by getting the first page
            getNextFile(null);
        });
    });
}


gdriveWrapper.prototype.listFilesByFolderId = function(gdriveDirectory, complete) {
    return new Promise((resolve, reject) => {
        const wrapperThis = this;

        var fileList = new Array();
        var getNextFile = function(nextPageToken) {
            wrapperThis.drive.files.list({
                    pageSize: 50,
                    pageToken: nextPageToken,
                    q: '\'' + parentMeta.id + '\' in parents' + ' and trashed != true' +
                        ' and mimeType != \'application/vnd.google-apps.folder\'',
                    space: 'drive'
                },
                function(err, response) {
                    if (err) {
                        reject({ error: err });
                    }
                    var files = response.data.files;
                    if (files.length === 0) {
                        resolve(fileList);
                    }

                    fileList = fileList.concat(files);

                    if (response.data.nextPageToken) {
                        getNextFile(response.data.nextPageToken);
                    } else {
                        resolve(fileList);
                    }
                }
            );
        }

        // ok now start by getting the first page
        getNextFile(null);
    });
}

module.exports = gdriveWrapper;