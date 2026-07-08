/* settings.js
 * Central app switches. Change true/false here without touching main logic.
 */
const SETTINGS = {
  pdf: {
    // true  = add PDF to the ZIP archive
    // false = ZIP contains only the two XLSX reports
    include: false,

    // true  = if a PDF field was changed in the editor, create edited PDF
    // false = add original PDF without PDF editing
    // Works only when pdf.include === true
    editChangedFields: true,
  },

  excel: {
    aufmass: true,
    material: true,
  },

  archive: {
    autoDownload: true,
    compression: 'DEFLATE',
  },

  ui: {
    showLoader: true,
    debug: false,
  },
};
