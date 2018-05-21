// Copyright 2016 the project authors as listed in the AUTHORS file.
// All rights reserved. Use of this source code is governed by the
// license that can be found in the LICENSE file.

const fs = require('fs'),
    path = require('path'),
    mimetype = require('mime-types'),
    pageSize = 5,
    apiRequestFields = 'id,name,size,parents,properties';

let gdriveWrapper = function(auth, google) {
    if (typeof auth == 'object' && typeof google == 'object') {
        this.drive = google.drive({ version: 'v3', auth: auth });
        return this;
    } else {
        throw new Error({ message: 'google-drive-wrapper::auth object and google parameters are required.' });
    }
}

gdriveWrapper.prototype.getFileMetadata = function(fileId) {
    const wrapperThis = this;
    return new Promise((resolve, reject) => {
        output = wrapperThis.drive.files.get({ fileId: fileId })
            .then(file => { resolve(file); })
            .catch(err => {
                err.message = "Error in getFileMetadata.files.get()";
                reject(err);
            });
    });
}

// options can include parents: [] and keepFileAfterUpload: true to keep uploaded files in their source location
gdriveWrapper.prototype.uploadFile = function(fileName, localPath, options) {
    const wrapperThis = this;
    return new Promise((resolve, reject) => {
        let parts = wrapperThis.pathSplit( fileName ),
            mkdirPromise = new Promise( ( resolve, reject ) => {
                if ( parts.length > 1 ) {
                    //This is async, but I expect the GoogleAPI to queue transactions so I don't see this failing to complete before the following create call is made
                    let newFolder = fileName.replace('/'+parts[parts.length - 1], '');
                    wrapperThis.mkdirp( newFolder)
                    .then( folder => {
                        resolve( [ folder.id ] );
                    })
                    .catch( err => {
                        reject( err );
                    });
                } else {
                    resolve( null );
                }
            });

        mkdirPromise.then( newParentId => {
            let extension = '',
                errorOccurred = false,
                handlePipeError = function(err) {
                if (!errorOccurred) {
                    errorOccurred = true;
                    err.fileName = fileName;
                    err.localPath = localPath;
                    reject(err);
                }
            };

            var mimeType = 'application/octet-stream';
            if (typeof localPath === 'string') {
                var uploadStream = fs.createReadStream(localPath);
                mimeType = mimetype.lookup(localPath.substring(localPath.indexOf('.')));
                if (mimeType === false) {
                    mimeType = 'application/octet-stream';
                }
            } else {
                uploadStream = localPath;
            }
            uploadStream.on('error', handlePipeError);

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
                fields: apiRequestFields
            }
            newFile.resource.name = path.basename(fileName + extension);
            newFile.resource.parents = newParentId || newFile.resource.parents || options.parents; // For backward compatibility
            newFile.resource.spaces = 'drive';
            newFile.resource.mimeType = uploadMimeType;
            newFile.resource.convert = convertOnUpload;
            newFile.resource.originallocalPath = path.basename(localPath);

            wrapperThis.drive.files.create(newFile)
                .then(response => {
                    if (response.status == "200") {
                        if ( !options.keepFileAfterUpload ) {
                            fs.unlink( localPath, done => {
                                response.data.localFileDeleted = true;
                                resolve(response.data);
                            });
                        } else {
                            response.data.localFileDeleted = false;
                            resolve(response.data);
                        }
                    } else {
                        err.message = "Error uploading file from gdriveWrapper.uploadFile()";
                        err.response = response;
                        reject(err);
                    }
                })
                .catch(err => {
                    console.dir(err);
                    err.message = "Error uploading file from gdriveWrapper.uploadFile()";
                    err.response = response;
                    reject(err);
                });
        });

    });
}

gdriveWrapper.prototype.downloadFile = function(fileId, localPath) {
    const wrapperThis = this;
    return new Promise((resolve, reject) => {
        var extension = '';
        wrapperThis.getFileMetadata(fileId)
            .then(meta => {
                var output = wrapperThis.drive.files.get({ fileId: fileId, alt: 'media' })
                    .then(() => {
                        // do nothing but we need this to avoid console output
                        // in error conditions
                    });

                // common error handler for pipes
                var errorOccurred = false;
                var handlePipeError = function(err) {
                    if (!errorOccurred) {
                        errorOccurred = true;
                        err.localPath = localPath;
                        reject(err);
                    }
                };

                var requestOutput = output;
                output.on('error', handlePipeError);
                output.on('end', function() {
                    // make sure we process any error event first
                    setImmediate(function() {
                        if (!errorOccurred) {
                            if (requestOutput.response.data.statusCode != 200) {
                                reject({ error: "Status code was :" + requestOutput.response.data.statusCode, message: requestOutput.response.data.statusMessage, localPath: localPath });
                            } else {
                                resolve({ meta: meta, targetFile: localPath });
                            }
                        }
                    });
                });

                output.pipe( fs.createWriteStream(localPath) );
            });
    });
}

gdriveWrapper.prototype.getMetaForFilename = function( drivePath ) {
    const wrapperThis = this;
    return new Promise((resolve, reject) => {

        // Get the names in the path, in order. The shift() is needed because the full path is injected in the first indice in the pathSplit function
        let fileComponents = this.pathSplit( drivePath );

        //Recursive function
        var findNext = function(parent, fileComponents, index) {
            var query = 'name = \'' + fileComponents[index] + '\'';
            if (parent !== null) {
                query = query + ' and \'' + parent + '\' in parents' + ' and trashed != true';
            }
            wrapperThis.drive.files.list({
                    spaces: 'drive',
                    pageSize: pageSize,
                    q: query
                })
            .then( response => {
                    if (!response.data.files.length || response.data.files.length == 0) {
                        // No error, just no match to return so giving up
                        resolve( null );
                    }
                    if ( typeof response != 'undefined' && response.data && index < (fileComponents.length - 1)) {
                        // Found a folder, but not the final. Keep searching.
                        index = index + 1;
                        findNext( response.data.files[0].id, fileComponents, index );
                    } else {
                        //Found what we wanted so return it
                        resolve(response.data.files[0]);
                    }
            })
            .catch( err => {
                err.source = 'google-drive-wrapper:gdriveWrapper.js:getMetaForFilename:files.list';
                reject(err);
            });
        }

        //Initiate recursion
        findNext(null, fileComponents, 0);
    });
}

gdriveWrapper.prototype.listFilesBypath = function(gdrivePath, complete) {
    const wrapperThis = this;
    return new Promise((resolve, reject) => {
        wrapperThis.getMetaForFilename(gdrivePath)
            .then(parentMeta => {
                var fileList = new Array();
                var getNextFile = function(nextPageToken) {
                    wrapperThis.drive.files.list({
                            pageSize: pageSize * 2,
                            pageToken: nextPageToken,
                            q: '\'' + parentMeta.id + '\' in parents' + ' and trashed != true' +
                                ' and mimeType != \'application/vnd.google-apps.folder\'',
                            space: 'drive'
                        })
                        .then(response => {
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
                        })
                        .catch(err => {
                            reject(err);
                        });
                }

                // ok now start by getting the first page
                getNextFile(null);
            })
            .catch(err => {
                err.message = 'Error in listFilesBypath().getMetaForFilesname().'
                reject(err);
            });
    });
}

gdriveWrapper.prototype.listFilesByFolderId = function(gdrivePath, complete) {
    return new Promise((resolve, reject) => {
        const wrapperThis = this;

        var fileList = new Array();
        var getNextFile = function(nextPageToken) {
            wrapperThis.drive.files.list({
                    pageSize: pageSize * 2,
                    pageToken: nextPageToken,
                    q: '\'' + parentMeta.id + '\' in parents' + ' and trashed != true' +
                        ' and mimeType != \'application/vnd.google-apps.folder\'',
                    space: 'drive'
                })
                .then(response => {
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
                })
                .catch(err => {
                    err.message = 'Error in listFilesByFolderId().drive.files.list().'
                    reject(err);
                });
        }

        // ok now start by getting the first page
        getNextFile(null);
    });
}

// Takes a single name and objectid of parent, then returns the created object
gdriveWrapper.prototype.mkdir = function( folderName, parentId ) {

    return new Promise( (resolve, reject) => {
        if (!folderName) {
            reject( new Error("google-drive-wrapper:mkdir::folderName is required") );
        }
        const wrapperThis = this;
        let fileMetadata = {
            name: folderName.replace(/^\//g, ''),
            mimeType: 'application/vnd.google-apps.folder'
        };
        if ( parentId ) {
            fileMetadata.parents = [ parentId ];
        }
        wrapperThis.drive.files.create({
            resource: fileMetadata,
            fields: apiRequestFields
        })
        .then( folder => {
            resolve( folder.data );
        })
        .catch( err => {
            console.error(err);
            reject( err );
        });
    });
};

//Accepts a string path from root (/), traverses the path and creates missing folders along the route,
//  then returns the target Drive folder object once found/created
gdriveWrapper.prototype.mkdirp = function(localPath) {
    const wrapperThis = this;
    return new Promise((resolve, reject) => {
        // Get the names in the path, in order. The shift() is needed because the full path is injected in the first indice in the pathSplit function
        let fileComponents = wrapperThis.pathSplit( localPath );

        //Recursive function
        var findNext = function(parent, fileComponents, index) {
            var folderName = fileComponents[index],
                query = 'name = \'' + folderName + '\' and trashed != true and \'' + ( parent ? parent : 'root' ) + '\' in parents';
            if ( folderName ) {

                wrapperThis.drive.files.list({
                        spaces: 'drive',
                        pageSize: pageSize,
                        q: query
                    })
                .then( response => {
                        if ( !response.data.files.length || response.data.files.length == 0 ) {
                            //Folder is missing. Create and continue search
                            if ( folderName == '/' ) {
                                index = index + 1;
                                findNext( response.data.files[0].id, fileComponents, index);
                            } else if ( folderName ) {
                                wrapperThis.mkdir( folderName, folderName == '/' || !parent ? 'root' : parent )
                                    .then( folder => {
                                        index = index + 1;
                                        if ( fileComponents[index] ) {
                                            findNext( folder.id, fileComponents, index);
                                        } else {
                                            resolve( folder );
                                        }
                                    })
                                    .catch( err => {
                                        err.message = 'Error in google-drive-wrapper:mkdirp:mkdir()';
                                        reject( err )
                                    });
                            }
                        } else if ( typeof response != 'undefined' && response.data && index < (fileComponents.length - 1)) {
                            //Folder is found, increment and contine search
                            index = index + 1;
                            findNext(response.data.files[0].id, fileComponents, index);
                        } else if ( response.data.files[0] ) {
                            resolve( response.data.files[0] );
                        } else {
                            reject( new Error("google-drive-wrapper:mkdirp():546::Unknown Error") );
                        }
                })
                .catch( err => {
                    err.source = 'google-drive-wrapper:gdriveWrapper.js:getMetaForFilename:files.list';
                    reject(err);
                });

            }

        }

        //Initiate recursion
        findNext(null, fileComponents, 0);
    });
}

//Accepts a string path as input and returns an array where the first index is the full path and the remaining are the parts of the path parsed by the path.sep value
gdriveWrapper.prototype.pathSplit = function(path) {
    let sep = '/',
        parts = path.split( sep );
    if ( parts[0] == '' || parts[0] == sep ) { parts.shift(); } //Remove that first, empty element
    // if ( parts[0] != path ) { parts.unshift( path ); } // Put the full path in the first index. Single-depth paths such as /foo will require this exclusion
    return parts;
}

module.exports = gdriveWrapper;