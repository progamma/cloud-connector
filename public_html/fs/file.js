/*
 * Instant Developer Cloud
 * Copyright Pro Gamma Spa 2000-2021
 * All rights reserved
 */

// Lazy require to break the FS<->File circular dependency at module load time.
// Initialised on first `new File(...)`; safe because by then `./fs` is fully loaded.
let FS;
let Directory;


/**
 * @class File
 * Represents a file object
 * @param {FS} fs
 * @param {String} path
 * @param {String} id
 */
class File
{
  constructor(fs, path, id)
  {
    FS ??= require("./fs");
    Directory ??= require("./directory");
    //
    // String containing the relative path of the file
    if (path)
      this.path = path;
    //
    this.fs = fs;
    //
    // String containing the encoding of the file, null by default: decided by the user at the time
    // of the creation of the physical file
    this.encoding = null;
    //
    if (id)
      this.id = id;
  }


  /**
   * Gets the file path.
   * @type {String}
   */
  get path()
  {
    return this._path;
  }


  /**
   * Sets the file path, automatically normalizing it.
   * @type {String}
   */
  set path(newValue)
  {
    this._path = FS.normalizePath(newValue);
  }


  /**
   * Gets the parent directory of this file.
   * @type {Directory}
   * @readonly
   */
  get parentDirectory()
  {
    let path = this.path.split("/");
    path.pop();
    return this.fs.directory(path.join("/"), this.type);
  }


  /**
   * Gets the absolute path to the file.
   * @type {String}
   * @readonly
   */
  get absolutePath()
  {
    return this.fs.getAbsolutePath(this);
  }


  /**
   * Returns debug information about this File instance for the DTT module.
   * Note: Used internally by the framework for debugging and logging purposes.
   * @returns {Object} Debug info containing _class, and path properties
   */
  getDebugInfo()
  {
    return {
      _class: "File",
      path: this.path
    };
  }


  /**
   * Creates the file physically on the filesystem.
   * Opens and overwrites if the file already exists.
   * Temporary files are automatically tracked for cleanup on termination.
   * **Note:** UTF-8 files automatically get a BOM (Byte Order Mark) prepended.
   * @param {String} [encoding] - File encoding ('utf8', 'utf-8', 'ascii', etc.). Null for binary files
   * @throws {Error} If attempting to create a resource type file
   */
  async create(encoding)
  {
    // String containing the encoding of the file, null only for binary files
    this.encoding = encoding || this.encoding;
    await this.fs.createFile(this);
    //
    // Write utf-8 BOM
    if (this.encoding === "utf-8")
      await this.write("﻿");
  }


  /**
   * Opens the file for reading operations.
   * **Note:** File must be closed after reading operations are complete to free resources.
   * @see File#close - To close the file after reading
   */
  async open()
  {
    await this.fs.openFile(this);
  }


  /**
   * Opens the file to append data at the end.
   * **Note:** File must be closed after append operations are complete to free resources.
   * @throws {Error} If attempting to append to a resource type file
   * @see File#close - To close the file after appending
   */
  async append()
  {
    await this.fs.openFileForAppend(this);
  }


  /**
   * Closes an open file handle.
   * **Note:** Always close files after open/append operations to free system resources.
   */
  async close()
  {
    await this.fs.close(this);
  }


  /**
   * Checks whether the file exists on the filesystem.
   * **Note:** Does not throw an error if the file doesn't exist, simply returns false.
   * @returns {Promise<Boolean>} True if file exists, false otherwise
   */
  async exists()
  {
    return await this.fs.fileExists(this);
  }


  /**
   * Reads a block of data from the file.
   * **Note:** File must be opened before calling this method.
   * @param {Number} [length] - Number of bytes to read (omit to read entire file)
   * @param {Number} [offset] - Starting position in the file
   * @returns {Promise<Buffer>} Node Buffer or ArrayBuffer with the data
   * @throws {Error} If length is less than 1 (when specified)
   */
  async read(length, offset)
  {
    // The length must be greater than 0, if she's "null" is read up to the end of file
    if (length && length < 1)
      throw new Error("Length must be greater than 0");
    //
    return await this.fs.read(this, length, offset);
  }


  /**
   * Reads the entire file as text.
   * **Note:** Default encoding is 'utf-8' if not specified.
   * **Note:** UTF-8 BOM is automatically removed if present.
   * **Note:** Resource files are downloaded via HTTP if needed.
   * @returns {Promise<String>} File contents as string
   */
  async readAll()
  {
    // If not specified the default encoding is utf-8
    this.encoding = this.encoding || "utf-8";
    //
    let data = await this.fs.readAll(this);
    //
    // Remove utf-8 BOM
    if (data.charCodeAt(0) === 65279)
      data = data.substring(1);
    //
    return data;
  }


  /**
   * Writes data to the file.
   * **Note:** Default encoding is 'utf-8' for string data if not specified.
   * **Note:** File must be opened/created before writing.
   * @param {String|Buffer} data - Data to write (string or buffer)
   * @param {Number} [offset] - Offset within the buffer to start writing from
   * @param {Number} [size] - Number of bytes to write
   * @param {Number} [position] - Position in file where to start writing
   */
  async write(data, offset, size, position)
  {
    // If not specified the default encoding is utf-8
    if (typeof data === "string")
      this.encoding = this.encoding || "utf-8";
    //
    // offset: offset relative to the buffer
    // size: number of bytes to write
    // position: position(bytes) of the file from which you start writing
    await this.fs.write(this, data, offset, size, position);
  }


  /**
   * Copies the file to a new location.
   * The original file remains unchanged.
   * @param {String} newPath - Destination path for the copy
   * @returns {Promise<File>} The new File object
   * @throws {Error} If attempting to copy a resource type file
   */
  async copy(newPath)
  {
    let newFile = this.fs.file(newPath);
    await this.fs.copyFile(this, newFile);
    return newFile;
  }


  /**
   * Renames or moves the file.
   * If newFile is a Directory or path ending with '/', keeps the original filename.
   * Updates the file's path and public URL after successful rename.
   * @param {String|File|Directory} newFile - New name, path, File object, or Directory to move into
   */
  async rename(newFile)
  {
    if (newFile instanceof Directory)
      newFile = this.fs.file(`${newFile.path}/${this.name()}`);
    else if (typeof newFile === "string" && newFile.endsWith("/"))
      newFile = this.fs.file(`${newFile}${this.name()}`);
    //
    await this.fs.renameObject(this, newFile);
    //
    if (typeof newFile === "string")
      newFile = this.fs.file(this.path.substring(0, this.path.lastIndexOf("/") + 1) + newFile);
    //
    // I change the path only if the file has been renamed correctly
    this.path = newFile.path;
  }


  /**
   * Gets the file size in bytes.
   * @returns {Promise<Number>} File size in bytes
   */
  async length()
  {
    return await this.fs.fileLength(this);
  }


  /**
   * Gets the filename including extension.
   * @returns {String} Filename with extension (e.g., 'document.pdf')
   */
  name()
  {
    return this.path.replace(/^.*(\\|\/|:)/, "");
  }


  /**
   * Gets the file extension without the dot.
   * @returns {String} Extension (e.g., 'pdf') or empty string if no extension
   */
  extension()
  {
    // Get only the file name
    let fileName = this.name();
    //
    // Returns only the extension (null for a binary file)
    if (fileName.length)
      return fileName.slice((~-fileName.lastIndexOf(".") >>> 0) + 2);
    //
    return "";
  }


  /**
   * Gets the last modified date of the file.
   * @returns {Promise<Date>} Last modified date as Date object
   */
  async dateTime()
  {
    return await this.fs.fileDateTime(this);
  }


  /**
   * Deletes the file from the filesystem.
   * **Note:** This operation is permanent and cannot be undone.
   * @throws {Error} If attempting to remove a resource type file
   */
  async remove()
  {
    await this.fs.deleteFile(this);
  }


  /**
   * Compresses the file into a ZIP archive.
   * **Note:** Creates a .zip file with the same name in the same directory.
   * @returns {Promise<File>} New File object for the created .zip file
   * @throws {Error} If attempting to zip a resource type file
   */
  async zip()
  {
    let zipFile = this.fs.file(`${this.path}.zip`);
    await this.fs.zipFile(this, zipFile);
    return zipFile;
  }


  /**
   * Extracts a ZIP archive to a directory.
   * @param {String} path - Destination directory path for extraction
   * @returns {Promise<Directory>} Directory object where files were extracted
   * @throws {Error} If attempting to unzip a resource type file
   */
  async unzip(path)
  {
    let unzipDir = this.fs.directory(path);
    await this.fs.unzip(this, unzipDir);
    return unzipDir;
  }
}


//  export module for node
module.exports = File;
