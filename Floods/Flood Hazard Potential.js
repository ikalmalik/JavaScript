//Data yang digunakan ada 4 jenis data yag digunakan yaitu://
//JRC/GSW1_4/GlobalSurfaceWater//
//USGS/SRTMGL1_003//
//COPERNICUS/S2_SR_HARMONIZED//
//projects/ee-malik24/assets/Area_DAS_Kali_Bekasi//

//AOI
var outline = ee.Image().byte().paint({
  featureCollection: roi,
  color: 1,
  width: 2
});
Map.addLayer(outline, {palette: ['Black']}, "Area Studi");
var roi = roi;

var clipToCol = function(image){
  return image.clip(roi);
};
Map.centerObject(roi, 13);
// Sentinel-2
var s2 = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(roi)
  .filterDate('2024-06-01', '2025-06-25')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
  .map(maskS2Clouds)
  .median()
  .clip(roi)
  .reproject('EPSG:4326', null, 10);
Map.addLayer(s2, { min: 0, max: [0.4, 0.3, 0.15], bands: ['B8', 'B11', 'B2'] }, 'Sentinel-2', false);


// Function to mask clouds and shadows for S2_SR
function maskS2Clouds(image){
  var scl = image.select('SCL');
  
  // Mask awan dan bayangan
  var mask = scl.neq(3) // Shadow
    .and(scl.neq(8)) // Cloud medium
    .and(scl.neq(9)) // Cloud high
    .and(scl.neq(10)) // Thin cirrus
    .and(scl.neq(11)); // Snow/ice

  // Pilih hanya band penting dan skala reflektansi
  return image.updateMask(mask)
    .select(['B1','B2','B3','B4','B5','B6','B7','B8','B8A','B9','B11','B12'])
    .divide(10000);
}

// Band map
var bandMap = {
  BLUE: s2.select('B2'),
  GREEN: s2.select('B3'),
  RED: s2.select('B4'),
  RE1: s2.select('B5'),
  RE2: s2.select('B6'),
  RE3: s2.select('B7'),
  NIR: s2.select('B8'),
  CIRRUS: s2.select('B10'),
  SWIR1: s2.select('B11'),
  SWIR2: s2.select('B12')
};

// Get water data
var water = gsw.select('occurrence').clip(roi);
Map.addLayer(water, { min: 0, max: 100, palette: ['white', 'cyan', 'blue' ]}, 'Water', false);

// Permanent water
var permanent = water.gt(80);
Map.addLayer(permanent.selfMask(), { palette: 'blue' }, 'Permanent Water', false);

// Rainbow palette
var rainbow = ['blue', 'cyan', 'green', 'yellow', 'red'];

// Distance from water
var distance = permanent.fastDistanceTransform().divide(30).clip(roi).reproject('EPSG:4326', null, 30);
Map.addLayer(distance, { max: 0, min: 5000, palette: rainbow}, 'Distance', false);

// Only the distance without permanent water
var onlyDistance = distance.updateMask(distance.neq(0).and(srtm.mask()));
Map.addLayer(onlyDistance, { min: 0, max: 5000, palette: rainbow}, 'Distance from permanent water', false);

// Distance
var distanceScore = onlyDistance.where(onlyDistance.gt(4000), 1)
  .where(onlyDistance.gt(3000).and(onlyDistance.lte(4000)), 2)
  .where(onlyDistance.gt(2000).and(onlyDistance.lte(3000)), 3)
  .where(onlyDistance.gt(1000).and(onlyDistance.lte(2000)), 4)
  .where(onlyDistance.lte(1000), 5);
Map.addLayer(distanceScore, { min: 1, max: 5, palette: rainbow }, 'Distance hazard score', false);
  
// Elevation data
var elevation = srtm.clip(roi);
Map.addLayer(elevation, { min: 0, max: 100, palette: ['green', 'yellow', 'red', 'white'] }, 'DEM', false);

// Eelvation score
var elevScore = elevation.updateMask(distance.neq(0)).where(elevation.gt(20), 1)
  .where(elevation.gt(15).and(elevation.lte(20)), 2)
  .where(elevation.gt(10).and(elevation.lte(15)), 3)
  .where(elevation.gt(5).and(elevation.lte(10)), 4)
  .where(elevation.lte(5), 5);
Map.addLayer(elevScore, { min: 1, max: 5, palette: rainbow }, 'Elevation hazard score', false);

// Create topographic position index
var tpi = elevation.subtract(elevation.focalMean(5).reproject('EPSG:4326', null, 30)).rename('TPI');
Map.addLayer(tpi, { min: -5, max: 5, palette: ['blue', 'yellow', 'red'] }, 'TPI', false);

// Topo score
var topoScore = tpi.updateMask(distance.neq(0)).where(tpi.gt(0), 1)
  .where(tpi.gt(-2).and(tpi.lte(0)), 2)
  .where(tpi.gt(-4).and(tpi.lte(-2)), 3)
  .where(tpi.gt(-6).and(tpi.lte(-4)), 4)
  .where(tpi.lte(-8), 5);
Map.addLayer(topoScore, { min: 1, max: 5, palette: rainbow }, 'Topographic hazard score', false);

// NDVI (Normalized Difference Vegetation Index)
var ndvi = s2.expression('(NIR - RED) / (NIR + RED)', bandMap).rename('NDVI');
Map.addLayer(ndvi, { min: -1, max: 1, palette: ['blue', 'white', 'green'] }, 'NDVI', false);

// EVI (Enhanced Vegetation Index)
var evi = s2.expression('2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', bandMap).rename('EVI');
Map.addLayer(evi, { min: -1, max: 1, palette: ['blue', 'white', 'green'] }, 'EVI', false);

// SAVI (Soil Adjusted Vegetation Index)
var savi = s2.expression('((NIR - RED) / (NIR + RED + 0.5)) * (1.5)', bandMap).rename('SAVI');
Map.addLayer(savi, { min: -1, max: 1, palette: ['blue', 'white', 'green'] }, 'SAVI', false);

//OSAVI (Optimized Soil Adjusted Vegetation Index)
var osavi = s2.expression('((NIR - RED) / (NIR + RED + 0.16)) * (1.16)', bandMap ).rename('OSAVI');
Map.addLayer(osavi, {min: -1, max: 1, palette: ['blue', 'white', 'green']}, 'OSAVI', false);

// SLAVI (Specific Leaf Area Vegetation Index)
var slavi = s2.expression('NIR / (RED + SWIR1)', bandMap).rename('SLAVI');
Map.addLayer(slavi, { min: -1, max: 1, palette: ['blue', 'white', 'green'] }, 'SLAVI', false);

// ARVI (Atmospherically Resistant Vegetation Index)
var arvi = s2.expression('(NIR - (2 * RED) + BLUE) / (NIR + (2 * RED) + BLUE)', bandMap).rename('ARVI');
Map.addLayer(arvi, { min: -1, max: 1, palette: ['blue', 'white', 'green'] }, 'ARVI', false);

// GNDVI (Green Normalized Difference Vegetation Index)
var gndvi = s2.expression('(NIR - GREEN) / (NIR + GREEN)', bandMap).rename('GNDVI');
Map.addLayer(gndvi, { min: -1, max: 1, palette: ['blue', 'white', 'green'] }, 'GNDVI', false);

//MSAVI (Modified Soil Adjusted Vegetation Index)
var msavi = s2.expression('(2 * NIR + 1 - sqrt((2 * NIR + 1) ** 2 - 8 * (NIR - RED))) / 2', bandMap).rename('MSAVI');
Map.addLayer(msavi, {min: -1, max: 1, palette: ['blue', 'white', 'green']}, 'MSAVI', false);

//NDRE (Normalized Difference Red Edge Index)
var ndre = s2.expression('(NIR - RE2) / (NIR + RE2)', bandMap).rename('NDRE');
Map.addLayer(ndre, {min: -1, max: 1, palette: ['blue', 'white', 'green']}, 'NDRE', false);

//VARI (Visible Atmospherically Resistant Index)
var vari = s2.expression('(GREEN - RED) / (GREEN + RED - BLUE)', bandMap).rename('VARI');
Map.addLayer(vari, {min: -1, max: 1, palette: ['blue', 'white', 'green']}, 'VARI', false);

// Composite Vegetation Index (Rata-rata semua indeks vegetasi)
var compositeVeg = ndvi.add(evi)
  .add(savi)
  .add(osavi)
  .add(slavi)
  .add(arvi)
  .add(gndvi)
  .add(msavi)
  .add(ndre)
  .add(vari)
  .divide(10)
  .rename('Composite_Vegetation_Index');
Map.addLayer(compositeVeg, { min: -1, max: 1, palette: ['blue', 'white', 'green'] }, 'Composite Vegetation Index', false);

// Vegetation score
var vegScore = ndvi.updateMask(distance.neq(0)).where(ndvi.gt(0.8), 1)
  .where(ndvi.gt(0.6).and(ndvi.lte(0.8)), 2)
  .where(ndvi.gt(0.4).and(ndvi.lte(0.6)), 3)
  .where(ndvi.gt(0.2).and(ndvi.lte(0.4)), 4)
  .where(ndvi.lte(0.2), 5);
Map.addLayer(vegScore, { min: 1, max: 5, palette: rainbow }, 'Vegetation hazard score', false);

// Vegetation hazard score dari composite index
var vegScorecom = compositeVeg.updateMask(distance.neq(0)).where(compositeVeg.gt(0.8), 1)
  .where(compositeVeg.gt(0.6).and(compositeVeg.lte(0.8)), 2)
  .where(compositeVeg.gt(0.4).and(compositeVeg.lte(0.6)), 3)
  .where(compositeVeg.gt(0.2).and(compositeVeg.lte(0.4)), 4)
  .where(compositeVeg.lte(0.2), 5);
Map.addLayer(vegScorecom, { min: 1, max: 5, palette: rainbow }, 'Vegetation hazard score (Composite)', false);

// NDWI (Normalized Difference Water Index)
var ndwi = s2.expression('(GREEN - NIR) / (GREEN + NIR)', bandMap).rename('NDWI');
Map.addLayer(ndwi, { min: -1, max: 1, palette: ['red', 'white', 'blue'] }, 'NDWI', false);

// MNDWI (Modified Normalized Difference Water Index)
var mndwi = s2.expression('(GREEN - SWIR1) / (GREEN + SWIR1)', bandMap).rename('MNDWI');
Map.addLayer(mndwi, { min: -1, max: 1, palette: ['red', 'white', 'blue'] }, 'MNDWI', false);

// ANDWI (Automated Normalized Difference Water Index)
var andwi = s2.expression('(GREEN - SWIR2) / (GREEN + SWIR2)', bandMap).rename('ANDWI');
Map.addLayer(andwi, { min: -1, max: 1, palette: ['red', 'white', 'blue'] }, 'ANDWI', false);

// NDMI (Normalized Difference Moisture Index) — Indeks Kelembaban Vegetasi
var ndmi = s2.expression('(NIR - SWIR1) / (NIR + SWIR1)', bandMap).rename('NDMI');
Map.addLayer(ndmi, { min: -1, max: 1, palette: ['red', 'white', 'blue'] }, 'NDMI', false);

// NDMI2 (Moisture Index Alternatif)
var ndmi2 = s2.expression('(SWIR1 - SWIR2) / (SWIR1 + SWIR2)', bandMap).rename('NDMI2');
Map.addLayer(ndmi2, {min: -1, max: 1, palette: ['red', 'white', 'blue']}, 'NDMI2', false);

// WRI (Water Ratio Index)
var wri = s2.expression('(GREEN + RED) / (NIR + SWIR1)', bandMap).rename('WRI');
Map.addLayer(wri, { min: -1, max: 1, palette: ['red', 'white', 'blue'] }, 'WRI', false);

//AWEI for Wetlands (AWEInsh)
var awei_nsh = s2.expression('4 * (GREEN - SWIR1) - (0.25 * NIR + 2.75 * SWIR2)', bandMap).rename('AWEInsh');
Map.addLayer(awei_nsh, {min: -1, max: 1, palette: ['red', 'white', 'blue']}, 'AWEI (Wetlands)', false);

//AWEI for Shadow Removal (AWEIsh)
var awei_sh = s2.expression('BLUE + 2.5 * GREEN - 1.5 * (NIR + SWIR1) - 0.25 * SWIR2', bandMap).rename('AWEIsh');
Map.addLayer(awei_sh, {min: -1, max: 1, palette: ['red', 'white', 'blue']}, 'AWEI (Shadow)', false);

// MBSI (Modified Bare Soil Index)
var mbsi = s2.expression('(SWIR1 - GREEN) / (SWIR1 + GREEN)', bandMap).rename('MBSI');
Map.addLayer(mbsi, { min: -1, max: 1, palette: ['red', 'white', 'blue'] }, 'MBSI', false);

// NWI (Normalized Water Index)
var nwi = s2.expression('(NIR + GREEN - (SWIR1 + SWIR2)) / (NIR + GREEN + SWIR1 + SWIR2)', bandMap).rename('NWI');
Map.addLayer(nwi, { min: -1, max: 1, palette: ['red', 'white', 'blue'] }, 'NWI', false);


// Composite water Index (Rata-rata semua indeks air)
var compositeWat = ndwi.add(mndwi)
  .add(andwi)
  .add(ndmi)
  .add(ndmi2)
  .add(wri)
  .add(awei_nsh)
  .add(awei_sh)
  .add(mbsi)
  .add(nwi)
  .divide(10)
  .rename('Composite_Water_Index');
Map.addLayer(compositeWat, { min: -1, max: 1, palette: ['red', 'white', 'blue'] }, 'Composite Water Index', false);

// Wetness score
var wetScore = ndwi.updateMask(distance.neq(0)).where(ndwi.gt(0.6), 5)
  .where(ndwi.gt(0.2).and(ndwi.lte(0.6)), 4)
  .where(ndwi.gt(-0.2).and(ndwi.lte(0.2)), 3)
  .where(ndwi.gt(-0.6).and(ndwi.lte(-0.2)), 2)
  .where(ndwi.lte(-0.6), 1);
Map.addLayer(wetScore, { min: 1, max: 5, palette: rainbow }, 'Wetness hazard score', false);

// Water hazard score dari composite index
var wetScorecom = compositeWat.updateMask(distance.neq(0)).where(compositeWat.gt(0.6), 5)
  .where(compositeWat.gt(0.2).and(compositeWat.lte(0.6)), 4)
  .where(compositeWat.gt(-0.2).and(compositeWat.lte(0.2)), 3)
  .where(compositeWat.gt(-0.6).and(compositeWat.lte(-0.2)), 2)
  .where(compositeWat.lte(-0.6), 1);
Map.addLayer(wetScorecom, { min: 1, max: 5, palette: rainbow }, 'Wetness hazard score  (Composite)', false);

// Flood hazard
var floodHazard = distanceScore.add(topoScore).add(vegScorecom).add(wetScorecom).add(elevScore).rename('Flood_hazard');
Map.addLayer(floodHazard, { min: 1, max: 20, palette: rainbow }, 'Flood hazard');

// Flood hazard scored
var floodHazardScore = floodHazard.where(floodHazard.gt(15), 5)
  .where(floodHazard.gt(10).and(floodHazard.lte(15)), 4)
  .where(floodHazard.gt(5).and(floodHazard.lte(10)), 3)
  .where(floodHazard.gt(0).and(floodHazard.lte(5)), 2)
  .where(floodHazard.lte(0), 1);
Map.addLayer(floodHazardScore, { min: 1, max: 5, palette: rainbow }, 'Flood hazard score', false);

// Add legend
var panel = ui.Panel([ ui.Label('Kelas Potensi Bahaya Banjir', { fontWeight: 'bold' }) ], ui.Panel.Layout.flow('vertical'), { position: 'bottom-left' });
var labels = [ 'Sangat Rendah', 'Rendah', 'Sedang', 'Tinggi', 'Sangat Tinggi' ];
var values = [ 1, 2, 3, 4, 5 ];
labels.map(function(label, index){
  panel.add(ui.Panel([
      ui.Label('', { backgroundColor: rainbow[index], height: '20px', width: '30px', border: '1px solid black' }),
      ui.Label(label, { height: '20px' }),
    ], ui.Panel.Layout.flow('horizontal')
  ));
});
Map.add(panel);

Export.image.toDrive({
  image: wetScorecom.clip(roi),
  description: 'Komposit_indeks_Air', 
  scale: 10, 
  region: roi, 
  maxPixels: 1e13, 
  crs: 'EPSG:4326',
  folder: 'GEE',
  fileFormat: 'GeoTIFF',
   formatOptions: {
    cloudOptimized: true
  }
});
