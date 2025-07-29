// AOI 
var outline = ee.Image().byte().paint({
  featureCollection: geometry,
  color: 1,
  width: 3
});
Map.addLayer(outline, {palette: ['Black']}, "Area Studi");
var geometry = geometry;
var clipToCol = function(image){
  return image.clip(geometry);
};
Map.centerObject(geometry, 14);

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Select the Landsat dataset
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// We use "Landsat Level 2 Collection 2 Tier-1 Scenes"

// Collection 2 -->
// Landsat Collection 2 algorithm has improved
// geometric and radiometric calibration that makes
// the collections interoperable.
// Learn more at https://www.usgs.gov/landsat-missions/landsat-collection-2

// Level 2 -->
// This is a surface reflectance product and 
// have the highest level of interoperability through time.

// Tier 1 -->
// Highest quality scenes which are considered suitable
// for time-series analysis
var L5 = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2');
var L7 = ee.ImageCollection('LANDSAT/LE07/C02/T1_L2');
var L8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2');

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Data Pre-Processing and Cloud Masking
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Mapping of band-names to a uniform naming scheme
var l5Bands = ['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'];
var l5names = ['blue','green','red','nir','swir1','swir2'];

var l7Bands = ['SR_B1','SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'];
var l7names = ['blue','green','red','nir','swir1','swir2'];

var l8Bands = ['SR_B2','SR_B3','SR_B4','SR_B5','SR_B6','SR_B7'];
var l8names = ['blue','green','red','nir','swir1','swir2'];

// Cloud masking function for Landsat 4,5 and 7
function maskL457sr(image) {
  var qaMask = image.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);
  var saturationMask = image.select('QA_RADSAT').eq(0);

  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2)
                          .clamp(-0.2, 1.6).float();  // Paksa ke rentang seragam
  var thermalBand = image.select('ST_B6').multiply(0.00341802).add(149.0)
                         .float();

  return image.addBands(opticalBands, null, true)
              .addBands(thermalBand, null, true)
              .updateMask(qaMask)
              .updateMask(saturationMask)
              .copyProperties(image, ['system:time_start']);
}

// Cloud masking function for Landsat 8
function maskL8sr(image) {
  var qaMask = image.select('QA_PIXEL').bitwiseAnd(parseInt('11111', 2)).eq(0);
  var saturationMask = image.select('QA_RADSAT').eq(0);

  var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2)
                          .clamp(-0.2, 1.6).float();
  var thermalBands = image.select('ST_B.*').multiply(0.00341802).add(149.0)
                          .float();

  return image.addBands(opticalBands, null, true)
              .addBands(thermalBands, null, true)
              .updateMask(qaMask)
              .updateMask(saturationMask)
              .copyProperties(image, ['system:time_start']);
}

// Apply filters, cloud-mask and rename bands
// Filters from https://github.com/google/earthengine-catalog/blob/main/pipelines/landsat.py
var L5 = L5
  .filter(ee.Filter.lt('WRS_ROW', 122))  // Remove night-time images.
  .map(maskL457sr)
  .select(l5Bands,l5names);

var L7 = L7
  .filter(ee.Filter.lt('WRS_ROW', 122))  // Remove night-time images.
  .filter(ee.Filter.date('1984-01-01', '2017-01-01'))  // Orbital drift after 2017.
  .map(maskL457sr)
  .select(l7Bands,l7names);

var L8 = L8
  .filter(ee.Filter.date('2013-05-01', '2099-01-01')) // Images before May 1 had some pointing issues.
  .filter(ee.Filter.neq('NADIR_OFFNADIR', 'OFFNADIR'))
  .filter(ee.Filter.lt('WRS_ROW', 122))  // Remove night-time images.
  .map(maskL8sr)
  .select(l8Bands,l8names);

// Adjust the range depending on your 
// application and location
var l5Start = ee.Date.fromYMD(1985, 1, 1);
var l5End = ee.Date.fromYMD(2013, 1, 1);

var l7Start = ee.Date.fromYMD(2001, 1, 1);
var l7End = ee.Date.fromYMD(2023, 1, 1);

var l8Start = ee.Date.fromYMD(2014, 1, 1);
var l8End = ee.Date.fromYMD(2024, 1, 1);

var L5 = L5
  .filter(ee.Filter.date(l5Start, l5End))
  .filter(ee.Filter.bounds(geometry));

var L7 = L7
  .filter(ee.Filter.date(l7Start, l7End))
  .filter(ee.Filter.bounds(geometry));

var L8 = L8
  .filter(ee.Filter.date(l8Start, l8End))
  .filter(ee.Filter.bounds(geometry));
  
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Optional: Gap-Fill Landsat 7
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

var kernelSize = 25;
var kernel = ee.Kernel.square(kernelSize * 30, 'meters', false);

var gapFill = function(image) {
  var start = image.date().advance(-1, 'year');
  var end = image.date().advance(1, 'year');
  var fill = L7.filter(ee.Filter.date(start, end)).median();
  var regress = fill.addBands(image); 
  var regress1 = regress.select(regress.bandNames().sort());
  var fit = regress1.reduceNeighborhood(
    ee.Reducer.linearFit().forEach(image.bandNames()),
    kernel, null, false);
  var offset = fit.select('.*_offset');
  var scale = fit.select('.*_scale');
  var scaled = fill.multiply(scale).add(offset);
  return image.unmask(scaled, true);
};

// Aktifkan gap-filling L7
var L7 = L7.map(gapFill);

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Create Annual Composites dengan rentang ±1 tahun (Rolling Median 3 Tahun)
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

var merged = L5.merge(L7).merge(L8);

// Sesuaikan tahun sesuai kebutuhan
var years = ee.List.sequence(1990, 2024);

var compositeImages = years.map(function(year) {
  var startDate = ee.Date.fromYMD(year, 1, 1).advance(-1, 'year');
  var endDate = ee.Date.fromYMD(year, 1, 1).advance(2, 'year');
  var yearFiltered = merged.filter(ee.Filter.date(startDate, endDate));
  var composite = yearFiltered.median();
  return composite.set({
    'year': year,
    'system:time_start': ee.Date.fromYMD(year, 1, 1).millis(),
    'system:time_end': ee.Date.fromYMD(year, 12, 31).millis(),
  });
});

var compositeCol = ee.ImageCollection.fromImages(compositeImages);
print('Annual Landsat Composites', compositeCol);

// Select the band combination
//var bands = ['red', 'green', 'blue'];
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
// Visualisasi dengan Masking area kosong agar bersih
// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

// Band kombinasi sesuai keperluan
var bands = ['swir1', 'nir', 'red'];

var visParams = {
  min: 0,
  max: 0.3,
  bands: bands
};

var compositeColVis = compositeCol.map(function(image) {
  return image.visualize(visParams)
              .clip(geometry)
              .selfMask()  // Mask area kosong
              .set('label', image.getNumber('year').format('%04d'));
});



// Earth Engine doesn't have a way to add text labels
// Use the 3rd-party text package to add annotations
var text = require('users/gena/packages:text');
var scale = Map.getScale(); // This is scale for text, adjust as required
var fontSize = 18;
var bounds = geometry.bounds();
var image = compositeColVis.first();
  
var annotations = [
  {
    // Use 'margin' for x-position and 'offset' for y-position
    position: 'right', offset: '5%', margin: '25%',
    property: 'label',
    scale: scale,
    fontType: 'Consolas', fontSize: 18
  }
];
  
var vis = {forceRgbOutput: true};

// Test the parameters
var results = text.annotateImage(image, vis, bounds, annotations);
Map.centerObject(geometry)
Map.addLayer(results, {}, 'Test Image with Annotation');

// Apple labeling on all images
var labeledImages = compositeColVis.map(function(image) {
  return text.annotateImage(image, vis, bounds, annotations);
});

// Export the collection as video
Export.video.toDrive({
  collection: labeledImages,
  description: 'Palembang_I',
  folder: 'GEE',
  fileNamePrefix: 'animation',
  crs:'EPSG:4326',
  framesPerSecond: 1,
  dimensions: 800,
  region: geometry,
});
