// 1. Define the area of interest (AOI) using a polygon geometry
var regionOfInterest = ee.Geometry.Polygon(
  [[[31.5321, 30.0118],
    [31.5321, 29.9999],
    [31.5487, 29.9999],
    [31.5487, 30.0118]]], null, false);
    
Map.addLayer(regionOfInterest, {}, 'region of interest', false);
Map.centerObject(geometry, 14);

// 2. Load the Google Open Buildings temporal dataset (2.5D version)
var buildingsTemporal = ee.ImageCollection('GOOGLE/Research/open-buildings-temporal/v1');

// 3. Define the scale (in meters) for analysis
var analysisScale = 1;  // the value 1, which means 1 meter per pixel resolution is used for analysis when aggregating data over AOI
                        // 1 meter means more detailed results,
                        // 10 or 30 meters means less detail,
                        
// 4. Loop through each year from 2018 to 2023 (inclusive)
for (var yr = 2018; yr < 2024; yr++) {
  

// 5. Convert year into a Unix timestamp 

var referenceDate = ee.Date(ee.String(yr.toString()).cat('-06-30'), 'America/Los_Angeles')
                  // .cat('-06-30'): Concatenates the string "2020" with "-06-30" to create the full date string "2020-06-30"
                  // ee.Date(..., 'America/Los_Angeles'): Creates an Earth Engine Date object for June 30th of the given year, using the Los Angeles time zone.
  
.millis()        // Converts the date into milliseconds since the Unix epoch (which starts at midnight, Jan 1, 1970, UTC).
.divide(1000);   // Convert milliseconds to seconds (Unix time is traditionally in seconds, not milliseconds)


// 6. Filter the dataset for that exact timestamp and merge the tiles into one image
  var yearlyMosaic = buildingsTemporal
                       .filter(ee.Filter.eq('inference_time_epoch_s', referenceDate))
                       .mosaic();

// 7. Estimate total building count using `reduceRegion` over the AOI
  var buildingCountEstimate = yearlyMosaic
    .reduceRegion({
      reducer: ee.Reducer.sum(),          // Summing the fractional building count pixels
      geometry: regionOfInterest,         // Area where the calculation is applied
      scale: analysisScale,               // Resolution of analysis
      crs: regionOfInterest.projection()  // Use the projection of the AOI
    })
    .getNumber('building_fractional_count')  // Extract the summed count
    .multiply(ee.Number(analysisScale * 2).pow(2));  // Adjust for original 0.5m resolution

// 8. Add building presence map to the GEE map viewer for each year
  Map.addLayer(
    yearlyMosaic.select('building_presence'),
    {min: 0, max: 1},
    yr.toString()
  );

// 9. Print the total estimated building count for the year
  print('Estimated Building Count in ' + yr + ':', buildingCountEstimate.getInfo());
}
