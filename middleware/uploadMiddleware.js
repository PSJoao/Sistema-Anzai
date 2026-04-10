// middleware/uploadMiddleware.js
const multer = require('multer');

const MAX_FILE_SIZE_MB = 500; 

// Lista de MIME types permitidos
const ACCEPTED_MIME_TYPES = new Set([
  // Texto / ZPL
  'text/plain',
  // Zip
  'application/zip',
  'application/x-zip-compressed',
  'multipart/x-zip',
  'application/x-compressed',
  'application/pdf',
  //EXCEL ---
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel' // .xls (antigo)
]);

// Lista de MIME types permitidos TXT
const ACCEPTED_MIME_TYPES_TXT = new Set([
  // Texto / ZPL
  'text/plain',
  // Zip
  'application/zip',
  'application/x-zip-compressed',
  'multipart/x-zip',
  'application/x-compressed',
  'application/pdf'
  //EXCEL ---
  /*'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel' // .xls (antigo)*/
]);

const storage = multer.memoryStorage();

const fileFilter = (req, file, callback) => {
  const isAllowedExt = file.originalname.match(/\.(zip|txt|xlsx|xls|pdf)$/i);
  
  if (ACCEPTED_MIME_TYPES.has(file.mimetype) || isAllowedExt) {
    return callback(null, true);
  }

  const error = new Error('Tipo de arquivo não suportado.');
  error.statusCode = 400;
  return callback(error);
};

const fileFilterText = (req, file, callback) => {
  const isAllowedExt = file.originalname.match(/\.(zip|txt|pdf)$/i);
  
  if (ACCEPTED_MIME_TYPES_TXT.has(file.mimetype) || isAllowedExt) {
    return callback(null, true);
  }

  const error = new Error('Tipo de arquivo não suportado.');
  error.statusCode = 400;
  return callback(error);
};

const ordersUploadText = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024
  },
  fileFilter: fileFilterText
});

const ordersUpload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024
  },
  fileFilter
});

module.exports = {
  ordersUpload,
  ordersUploadText
};