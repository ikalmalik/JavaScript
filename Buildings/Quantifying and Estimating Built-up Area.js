// 1. Create the Region of interest (ROI)
var targetArea = ee.Geometry.Polygon(
        [[[31.317952066128143, 30.141730882041987],
          [31.317952066128143, 30.137926768709228],
          [31.322436719601043, 30.137926768709228],
          [31.322436719601043, 30.141730882041987]]], null, false);
          
Map.addLayer(targetArea, {}, 'Study area', false);
Map.centerObject(geometry, 12);

// 2. Load the temporal Google Open Buildings dataset
var buildingDataset = ee.ImageCollection('GOOGLE/Research/open-buildings-temporal/v1');

// 3. Set the analysis resolution (in meters)
var analysisScale = 1;  // Use a higher number like 10 or 30 for large AOIs to prevent memory issues

// 4. Confidence threshold for detecting buildings (can be adjusted based on region)
var confidenceThreshold = 0.34;

// 5. Loop through each year to analyze annual building area
for (var yr = 2016; yr < 2024; yr++) {

// 5a. Create a Unix timestamp for June 30th of the current year (in seconds)
var timeTag = ee.Date(ee.String(yr.toString()).cat('-06-30'), 'America/Los_Angeles')
// .cat('-06-30'): Concatenates the string "2020" with "-06-30" to create the full date string "2020-06-30"
// ee.Date(..., 'America/Los_Angeles'): Creates an Earth Engine Date object for June 30th of the given year, using the Los Angeles time zone.

                  .millis()           // Converts the date into milliseconds since the Unix epoch (which starts at midnight, Jan 1, 1970, UTC).
                  .divide(1000);      // Convert milliseconds to seconds (Unix time is traditionally in seconds, not milliseconds)

// 5b. Filter image collection for the specified timestamp and generate a single mosaic image
var yearlyMosaic = buildingDataset
                      .filter(ee.Filter.eq('inference_time_epoch_s', timeTag))
                      .mosaic();

// 5c. Apply threshold to detect buildings (1 = present, 0 = absent)
yearlyMosaic = yearlyMosaic.addBands({
    srcImg: yearlyMosaic.select('building_presence').gt(confidenceThreshold),
    overwrite: true
  });

// 5d. Calculate total building area using reduceRegion
  var totalBuiltArea = yearlyMosaic
    .reduceRegion({
      reducer: ee.Reducer.sum(),       // Summing the fractional building count pixels
      geometry: targetArea,            // Study area (targetArea)
      scale: analysisScale,            // Resolution of analysis
      crs: targetArea.projection()     // Use the projection of the AOI
    })
    .getNumber('building_presence')              // This will be a count of pixels with presence = 1
    .multiply(ee.Number(analysisScale).pow(2));  // Convert pixel count to square meters

// 5e. Visualize the result on the map
  Map.addLayer(
    yearlyMosaic.select('building_presence'), 
    {min: 0, max: 1, palette: ['white', 'blue']}, 
    'Buildings_' + yr
  );

// 5f. Print the total building area for each year
  print('Built-up Area (sqm) in ' + yr + ':', totalBuiltArea.getInfo());
}
