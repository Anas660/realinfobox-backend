const _ = require('lodash')
const dfns = require('date-fns')
const s3 = require('../services/aws/s3');
const dynamo = require('../services/aws/dynamo');
const cry = require('../services/encryption');
const {convertToCamel} = require('../services/formatting');

const reportService = require('../services/reports')
const edmontonStructure = require('../config/edmontonStructure')
const edmontonConfig = require('../config/edmontonConfig')

const {fail, succeed} = require('../services/responses');

const {
  IS_OFFLINE,
  FRONTEND_URL,
  S3_REPORTS_BUCKET,
  APP_TABLE,
} = process.env;
const frontendUrl = IS_OFFLINE ? 'http://localhost:3000' : FRONTEND_URL;

const self = module.exports = {
  reportDataFields: () => ({
    soldPercent: null,
    unsoldPercent: null,
    soldPercentDelta: null,
    soldDelta: null,
    activeDelta: null,
    benchmarkPrice: null,
    benchmarkPriceYTD: null,
    benchmarkPriceDelta: null,
    benchmarkPriceYTDDelta: null,
    domDelta: null,
    sold: null,
    active: null,
    dom: null,
    marketDistribution: null,
  }),
  brandingGet: async (req, res) => {
    try {
      let userId = req.query.userId || res.locals.user.id;

      const brandingDb = await reportService.getUserBranding(userId)
      succeed(res, brandingDb);
      return


    } catch (error) {
      fail(res, error)
    }
  },
  brandingPatch: async (req, res) => {
    try {
      const {bannerType, customBannerUrl, logoUrl, backgroundUrl, agentPhotoUrl, color1, color2, color3, name, title, company, phone, website, email, bannerHeight} = req.body
      let userId = res.locals.user.id;

      await reportService.putUserBranding(userId,
        {
          bannerType,
          customBannerUrl,
          logoUrl,
          backgroundUrl,
          agentPhotoUrl,
          color1,
          color2,
          color3,
          name,
          title,
          company,
          phone,
          website,
          email,
          bannerHeight,
        })

      res.send()
    } catch (error) {
      fail(res, error)
    }
  },
  setLastAvailable: async (req, res) => {
    try {
      const {cityName} = req.params;
      const {date} = req.body;
      const lastAvailable = await reportService.setLastAvailable(cityName, date);
      succeed(res, lastAvailable);
    } catch (error) {
      fail(res, error)
    }
  },
  getLastAvailable: async (req, res) => {
    try {
      const {cityName} = req.params;
      const lastAvailable = await reportService.getLastAvailable(cityName);
      const result = {
        city: cityName,
        date: null,
        ...lastAvailable,
      }
      succeed(res, result);
    } catch (error) {
      fail(res, error)
    }
  },
  calgaryList: async (req, res) => {
    try {
      const allEntities = await dynamo.getAllOfEntity('REPORT')
      const grouped = _.groupBy(allEntities, 'pk')
      const result = {}
      const omit = ['pk', 'sk', 'entity']
      Object.keys(grouped).forEach((pk)=> {
        const groupedArray = grouped[pk]
        const attrsRow = groupedArray.find(ga => ga.sk === 'ATTRIBUTES')
        const dataRow = groupedArray.find(ga => ga.sk === 'DATA')
        if (attrsRow)
          result[attrsRow.date] = {
            attributes: _.omit(attrsRow, omit),
            data: _.omit(dataRow, omit),
          }
      })

      res.json(result);
    } catch (error) {
      fail(res, error)
    }
  },
  updateCalgaryBenchmarkPrice: async (req, res) => {
    try{
      const {benchmarkPrice, keyDate} = req.body;
      const {region, type} = req.params;

      if(!type || !benchmarkPrice || !type){
        throw {
          statusCode: 422,
          code: 'UnprocessableEntity',
          message: 'Missing required parameters.',
        }
      }

      const parsedType = type.toLowerCase();

      const response = await reportService.updateCalgaryBenchmarkPrice(benchmarkPrice, keyDate, region, parsedType);

      res.json(response);
    }catch (error) {
      fail(res, error)
    }
  },
  calgaryStructure: async (req, res) => {
    try {
      const structure = reportService.getCalgaryStructure()
      res.json(structure);
    } catch (error) {
      fail(res, error)
    }
  },
  calgaryDetail: async (req, res) => {
    try {
      const {month, year, name} = req.params
      const loadBranding = req.query.branding
      const {user} = res.locals
      const lastDate = dfns.startOfMonth(new Date(year, month-1))
      const months = await reportService.loadCalgaryNMonths(name, lastDate, 14)
      const years = await reportService.loadCalgaryNYears(name, lastDate, 11)

      const reportObject = {
        month, year, name, city: 'calgary', userId: user.id,
      }
      const reportToken = cry.aes256cbc.encrypt(JSON.stringify(reportObject))
      const previewUrl = frontendUrl + '/market-reports/preview?report_token=' + reportToken;

      const isCalgaryCity = (name === 'City of Calgary')
      // load extra year trend data for calgary if not calgary itself
      let calgaryYears
      if (!isCalgaryCity) {
        calgaryYears = await reportService.loadCalgaryNYears('City of Calgary', lastDate, 11)
      }
      let marketDistribution
      if (isCalgaryCity) {
        const monthStr = `${month}`.padStart(2, 0)
        marketDistribution = await reportService.getMDData('calgary', `${year}-${monthStr}`)
      }
      let propertyTypes = [...reportService.propertyTypes.calgary]
      const monthsResults = await reportService.calculateReportMonthsData(months, propertyTypes, marketDistribution)
      const yearsResults = await reportService.calculateReportYearsData(years, propertyTypes)

      let branding = null;
      if (loadBranding) {
        branding = await reportService.getUserBranding(user.id)
        branding = convertToCamel(branding)
      }

      const result = {
        previewUrl,
        reportToken,
        branding,
        ...reportObject,
        months: monthsResults,
        years: yearsResults,
      }
      if (!isCalgaryCity) {
        result.cityYears = await reportService.calculateReportYearsData(calgaryYears, propertyTypes)
      }
      res.json(result);
    } catch (error) {
      fail(res, error)
    }
  },
  calgaryUploadUrl: async (req, res) => {
    try {
      const { user } = res.locals;
      const { year, month, type } = req.query;
      if (type !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
        throw {
          statusCode: 400,
          code: 'BadFileType',
          message: 'Type is not XLSX',
        }
      }
      const fileKey = `reports/calgary/${year.padStart(2, '0')}${month.padStart(2, '0')}.xlsx`

      const url = await s3.getSignedUrl(S3_REPORTS_BUCKET, 'putObject', fileKey, type.replace(' ', '+') );

      res.json({url});

    } catch (error) {
      fail(res, error);
    }
  },
  customBannerUrl: async (req, res) => {
    try {
      const { user } = res.locals;
      const { name, type } = req.query;
      // if (type !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      //   throw {
      //     statusCode: 400,
      //     code: 'BadFileType',
      //     message: 'Type is not XLSX',
      //   }
      // }

      const splitName = name.split('.');
      const extension = splitName[splitName.length-1];
      const fileName = `custom-banner_${Date.now()}.${extension}`;
      const filekey = `reports/users/${user.id}/${fileName}`;

      const url = await s3.getSignedUrl(
        S3_REPORTS_BUCKET,
        'putObject',
        filekey,
        type.replace(' ', '+'),
      );

      res.json({url});

    } catch (error) {
      fail(res, error);
    }
  },
  brandingImageUrl: async (req, res) => {
    try {
      const { user } = res.locals;
      const { name, type, imageType} = req.query;
      // if (type !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      //   throw {
      //     statusCode: 400,
      //     code: 'BadFileType',
      //     message: 'Type is not XLSX',
      //   }
      // }

      const splitName = name.split('.');
      const extension = splitName[splitName.length-1];
      const fileName = `${imageType}_${Date.now()}.${extension}`;
      const filekey = `reports/users/${user.id}/${fileName}`;

      const url = await s3.getSignedUrl(
        S3_REPORTS_BUCKET,
        'putObject',
        filekey,
        type.replace(' ', '+'),
      );

      res.json({url});

    } catch (error) {
      fail(res, error);
    }
  },
  marketDistributionGet: async (req, res) => {
    try {
      const {cityName} = req.params;
      const {month, year} = req.params
      const data = await reportService.getMDData(cityName, `${year}-${month}`)
      let mdRanges = await reportService.getMDRanges(cityName)
      if (!mdRanges) {
        //defaults
        mdRanges = {
          city: cityName,
          ranges: [
            { rangeFrom: '1' },
            { rangeFrom: '200000' },
            { rangeFrom: '300000' },
            { rangeFrom: '400000' },
            { rangeFrom: '500000' },
            { rangeFrom: '600000' },
            { rangeFrom: '700000' },
            { rangeFrom: '800000' },
            { rangeFrom: '900000' },
            { rangeFrom: '1000000' },
            { rangeFrom: '1500000' },
            { rangeFrom: '2000000' },
          ],
        }
      }

      const {ranges} = mdRanges;

      let response = data;
      if (!data && !ranges)
        response = [{}]
      else if (!data) {
        response = {
          data: ranges,

        }
      } else {
        //both ranges and data available
        if (data.length < ranges.length) {
          const merged = _.mergeWith(_.keyBy(data, 'rangeFrom'), _.keyBy(ranges, 'rangeFrom'), (objValue, srcValue) => ({...objValue, ...srcValue}))
          response = Object.values(merged)
        }
      }

      res.json({
        ...response,
        propertyTypes: reportService.propertyTypes[cityName],
      });
    } catch (error) {
      fail(res, error);
    }
  },
  marketDistributionPut: async (req, res) => {
    try {
      const {cityName} = req.params;
      const {month, year} = req.params
      let {data} = req.body
      let ranges = data.map(d=>({rangeFrom: d.rangeFrom}))
      const date = `${year}-${month}`

      data = await reportService.setMDData(cityName, date, data)
      ranges = await reportService.setMDRanges(cityName, ranges)
      res.json({
        data: data.data,
        ranges: ranges.ranges,
      });
    } catch (error) {
      fail(res, error);
    }
  },

  dataGet: async (req, res) => {
    try {
      const {cityName, locationName} = req.params;
      const {month, year} = req.params

      const cityUpper = cityName.toUpperCase();
      const nameHash = locationName.toUpperCase().replace(' ', '_')
      const pk = `REPORT|${cityUpper}`
      const sk = `DATA|${nameHash}|${year}-`+`${month}`.padStart(2, '0')
      let data = await dynamo.get({pk, sk});
      data = _.omit(data, ['pk', 'sk', 'entity'])

      let response = {
        geojet: null,
      }
      if (cityName === 'edmonton') {
        response.geojet = reportService.getMlsEnsightUrl(locationName);
      }

      const pts = reportService.propertyTypes[cityName];

      pts.forEach(pt => {
        const obj = {}
        reportService.defaultFields.forEach(df => {
          obj[df] = data[pt] ? (data[pt][df] || null) : null
        })
        response[pt] = obj
      })

      res.json({
        ...response,
        propertyTypes: reportService.propertyTypes[cityName],
      });
    } catch (error) {
      fail(res, error);
    }
  },
  dataPut: async (req, res) => {
    try {
      const {cityName, locationName} = req.params;
      const {month, year} = req.params

      const cityUpper = cityName.toUpperCase();
      const nameHash = locationName.toUpperCase().replace(' ', '_')
      const pk = `REPORT|${cityUpper}`
      const sk = `DATA|${nameHash}|${year}-`+`${month}`.padStart(2, '0')
      let data = await dynamo.get({pk, sk});
      const pts = reportService.propertyTypes[cityName];

      let response = {}
      pts.forEach(pt => {
        const obj = {}
        reportService.defaultFields.forEach(df => {
          obj[df] = req.body[pt] ? (req.body[pt][df] || null) : null
        })
        response[pt] = obj
      })

      const item = {
        pk,
        sk,
        entity: 'REPORT',
        month: parseInt(month),
        year: parseInt(year),
        locationName,
        ...data,
        ...response,
      }

      await dynamo.put(APP_TABLE, item)

      res.json(item);
    } catch (error) {
      fail(res, error);
    }
  },

  getSocialReport: async (req, res) => {
    try {
      const {cityName, locationName} = req.params;
      const cityUpper = cityName.toUpperCase();
      const nameHash = locationName.toUpperCase().replace(' ', '_');
      const pk = `REPORT|${cityUpper}`;

      const lastAvailable = await reportService.getLastAvailable(cityName);
      const [year, month] = lastAvailable.date.split('-');

      const pts = reportService.propertyTypes[cityName];

      const omit = ['pk', 'sk', 'entity', 'locationName', 'name']
      let dataThisM, dataLastM, dataLastY;

      const thisMString = reportService.getDateStr(year, month);
      let lastMString = reportService.getDateStr(year, month-1);
      const lastYString = reportService.getDateStr(year-1, month);

      if (lastMString.endsWith('-00')) {
        // year break
        lastMString = reportService.getDateStr(year-1, 12);
      }

      if (cityUpper === 'CALGARY') {
        sk = 'DATA';
        let path;
        let resData = await dynamo.get({pk: pk+'|'+thisMString, sk}, omit);

        if (Object.values(resData).length && !path) {
          path = reportService.getLocationPath(locationName, resData)
        }
        data = _.get(resData, path)
        dataThisM = data ? data.data : null

        resData = await dynamo.get({pk: pk+'|'+lastMString, sk}, omit);
        data = _.get(resData, path)
        dataLastM = data ? data.data : null

        resData = await dynamo.get({pk: pk+'|'+lastYString, sk}, omit);
        data = _.get(resData, path)
        dataLastY = data ? data.data : null


      } else {
        //get data for current month
        sk = `DATA|${nameHash}|${thisMString}`;
        dataThisM = _.omit(await dynamo.get({pk, sk}), omit);

        //get data for last month
        sk = `DATA|${nameHash}|${lastMString}`;
        dataLastM = _.omit(await dynamo.get({pk, sk}), omit);

        //get data for last year's month
        sk = `DATA|${nameHash}|${lastYString}`;
        dataLastY = _.omit(await dynamo.get({pk, sk}), omit);
      }

      dataThisM.soldTotal = 0
      dataThisM.activeTotal = 0
      dataThisM.domTotal = 0
      dataThisM_domAvgTuples = []

      dataLastM.soldTotal = 0
      dataLastM.activeTotal = 0
      dataLastM.domTotal = 0
      dataLastM_domAvgTuples = []

      dataLastY.soldTotal = 0
      dataLastY.activeTotal = 0
      dataLastY.domTotal = 0
      dataLastY_domAvgTuples = []

      pts.forEach(pt => {
        if (!dataThisM[pt]) dataThisM[pt] = {}
        if (!dataLastM[pt]) dataLastM[pt] = {}
        if (!dataLastY[pt]) dataLastY[pt] = {}

        reportService.defaultFields.forEach(df => {
          dataThisM[pt][df] = dataThisM[pt] ? (dataThisM[pt][df] || null) : null
          dataLastM[pt][df] = dataLastM[pt] ? (dataLastM[pt][df] || null) : null
          dataLastY[pt][df] = dataLastY[pt] ? (dataLastY[pt][df] || null) : null
        })

        dataThisM.soldTotal += dataThisM[pt].sold
        dataThisM.activeTotal += dataThisM[pt].active
        dataThisM.domTotal += dataThisM[pt].dom
        dataThisM_domAvgTuples.push([dataThisM[pt].dom, dataThisM[pt].sold])
        dataThisM[pt].benchmarkPriceDeltaMTM = reportService.getDelta(dataThisM[pt].benchmarkPrice, dataLastM[pt].benchmarkPrice)
        dataThisM[pt].benchmarkPriceDeltaYTY = reportService.getDelta(dataThisM[pt].benchmarkPrice, dataLastY[pt].benchmarkPrice)

        dataLastM.soldTotal += dataLastM[pt].sold
        dataLastM.activeTotal += dataLastM[pt].active
        dataLastM.domTotal += dataLastM[pt].dom
        dataLastM_domAvgTuples.push([dataLastM[pt].dom, dataLastM[pt].sold])

        dataLastY.soldTotal += dataLastY[pt].sold
        dataLastY.activeTotal += dataLastY[pt].active
        dataLastY.domTotal += dataLastY[pt].dom
        dataLastY_domAvgTuples.push([dataLastY[pt].dom, dataLastY[pt].sold])
      })

      const weightedAvg = function(tuples) {
        const [valueSum, weightSum] = tuples.reduce(([valueSum, weightSum], [value, weight]) =>
          ([valueSum + value * weight, weightSum + weight]), [0, 0]);

        return valueSum / weightSum
      }

      dataThisM.domAvg = Math.ceil(weightedAvg(dataThisM_domAvgTuples))
      dataLastM.domAvg = Math.ceil(weightedAvg(dataLastM_domAvgTuples))
      dataLastY.domAvg = Math.ceil(weightedAvg(dataLastY_domAvgTuples))

      dataThisM.moi = reportService.toFloat(dataThisM.activeTotal/dataThisM.soldTotal)
      dataLastM.moi = reportService.toFloat(dataLastM.activeTotal/dataLastM.soldTotal)
      dataLastY.moi = reportService.toFloat(dataLastY.activeTotal/dataLastY.soldTotal)

      dataThisM.listingAbsp = reportService.toFloat(100*dataThisM.soldTotal/dataThisM.activeTotal)
      dataLastM.listingAbsp = reportService.toFloat(100*dataLastM.soldTotal/dataLastM.activeTotal)
      dataLastY.listingAbsp = reportService.toFloat(100*dataLastY.soldTotal/dataLastY.activeTotal)

      res.json({
        thisM: dataThisM,
        lastM: dataLastM,
        lastY: dataLastY,
      });

    } catch (error) {
      fail(res, error);
    }
  },

  // EDMONTON
  edmontonImport: async (req, res) => {
    try {
      const {year, locationName} = req.body
      const data = await reportService.edmontonImport(year, locationName)
      const counts = {
        cities: Object.keys(data.cities).length,
        mds: Object.keys(data.mds).length,
        communities: Object.keys(data.communities).length,
      }
      console.log('imported: ',counts)
      res.json(data);
    } catch (error) {
      fail(res, error);
    }
  },
  edmontonStructure: async (req, res) => {
    try {
      // const struc = await reportService.createEdmontonStructure();
      // res.json(struc);
      res.json(edmontonStructure);
    } catch (error) {
      fail(res, error)
    }
  },
  winnipegStructure: async (req, res) => {
    try {
      const structure = reportService.winnipegStructure()
      res.json(structure);
    } catch (error) {
      fail(res, error)
    }
  },
  winnipegDetail: async (req, res) => {
    try {
      const {locationName} = req.params;

      const statistics = await reportService.winnipegDetail(locationName);

      res.json(statistics);
    } catch (e) {
      fail(res, error)
    }
  },
  winnipegCityDetail: async (req, res) => {
    try {
      const {year, month} = req.params;

      const statistics = await reportService.winnipegCityDetail(year, month);

      res.json({
        ...statistics,
        propertyTypes: reportService.propertyTypes['winnipeg'],
      });
    } catch (e) {
      fail(res, error)
    }
  },
  updateWinnipegCityDetail: async (req, res) => {
    try {
      const {year, month} = req.params;

      const data = req.body;

      await reportService.updateWinnipegCityDetail(data, year, month);

      res.json();
    } catch (e) {
      fail(res, error)
    }
  },
  edmontonDetail: async (req, res) => {
    try {
      const {month, year, name} = req.params
      const loadBranding = req.query.branding
      const {user} = res.locals

      const lastDate = dfns.startOfMonth(new Date(year, month-1))
      const months = await reportService.loadEdmontonNMonths(name, lastDate, 14)
      const years = await reportService.loadEdmontonNYears(name, lastDate, 11)

      const reportObject = {
        month, year, name, city: 'edmonton', userId: user.id,
      }
      const stringyJson = JSON.stringify(reportObject);
      const reportToken = cry.aes256cbc.encrypt(stringyJson)
      const previewUrl = frontendUrl + '/market-reports/preview?report_token=' + reportToken;

      // load extra year trend data for calgary if not calgary itself
      const isEdmonton = (name === 'Edmonton')
      let edmoYears
      if (!isEdmonton) {
        edmoYears = await reportService.loadEdmontonNYears('Edmonton', lastDate, 11)
      }

      let marketDistribution
      let propertyTypes = edmontonConfig.propertyClasses.map(cls => cls.displayName)
      if (isEdmonton) {
        // edmonton city has extra duplex type
        propertyTypes = [...propertyTypes, 'duplex'];
        const monthStr = `${month}`.padStart(2, 0)
        marketDistribution = await reportService.getMDData('edmonton', `${year}-${monthStr}`)
      }

      const monthsResults = await reportService.calculateReportMonthsData(months, propertyTypes, marketDistribution)
      const yearsResults = await reportService.calculateReportYearsData(years, propertyTypes)

      let branding = null;
      if (loadBranding) {
        branding = await reportService.getUserBranding(user.id)
        branding = convertToCamel(branding)
      }

      const result = {
        previewUrl,
        reportToken,
        branding,
        geojet: reportService.getMlsEnsightUrl(name),
        ...reportObject,
        months: monthsResults,
        years: yearsResults,
        propertyTypes,
      }
      if (!isEdmonton) {
        result.cityYears = await reportService.calculateReportYearsData(edmoYears, propertyTypes)
      }
      res.json(result);
    } catch (error) {
      fail(res, error)
    }
  },
  edmontonFillMlsensightAreaData: async (req, res) => {
    try {
      const {year} = req.body

      const months = Array.from({length:12},(v,k)=>1+k)
      if (year) {
        await Promise.all(months.map(month => {
          return reportService.fillEdmontonAreaData(year, month);
        }));

      } else {
        let years = [2020, 2021]
        for (const year of years) {
          await Promise.all(months.map(async month => {
            return await reportService.fillEdmontonAreaData(year, month);
          }));
        };
        years = Array.from({length:8},(v,k)=>2019-k)
        for (const year of years) {
          await reportService.fillEdmontonAreaData(year, 12);
        };
      }
      res.send()
    } catch (error) {
      fail(res, error)
    }
  },
  edmontonRecalculateEdmontonAveragePriceYTD: async (req, res) => {
    try {
      const {year} = req.body

      const locationNames = await reportService.edmontonGetAllLocationNames();

      if (year) {
        await Promise.all(locationNames.map(locationName => {
          return reportService.calculateEdmontonAveragePriceYTD(locationName, year)
        }))

      } else {
        let years = [2020,2021, 2022]
        for (const year of years) {
          await Promise.all(locationNames.map(locationName => {
            return true;
            // return reportService.calculateEdmontonAveragePriceYTD(locationName, year)
          }))
        };

        years = Array.from({length:8},(v,k)=>2019-k)
        for (const year of years) {
          await Promise.all(locationNames.map(locationName => {
            return reportService.calculateEdmontonAveragePriceYTD(locationName, year, 12)
          }))
          console.log('@year done: ',year)
        }
      }
      res.send()
    } catch (error) {
      fail(res, error)
    }
  },

  // other cities
  cityDetailLatest: async (req, res) => {
    try {
      const {cityName, locationName} = req.params;
      const loadBranding = req.query.branding
      const {user} = res.locals

      const lastAvailable = await reportService.getLastAvailable(cityName);
      const [year, month] = lastAvailable.date.split('-');
      const lastDate = dfns.startOfMonth(new Date(year, month-1))
      const months = await reportService.loadCityNMonths(cityName, locationName, lastDate)
      const years = await reportService.loadCityNYears(cityName, locationName, lastDate)
      const reportObject = {
        month, year, name: locationName, city: cityName, userId: user.id,
      }
      const stringyJson = JSON.stringify(reportObject);
      const reportToken = cry.aes256cbc.encrypt(stringyJson)
      const previewUrl = frontendUrl + '/market-reports/preview?report_token=' + reportToken;

      let propertyTypes = reportService.propertyTypes[cityName]

      const monthsResults = await reportService.calculateReportMonthsData(months, propertyTypes)
      const yearsResults = await reportService.calculateReportYearsData(years, propertyTypes)

      let branding = null;
      if (loadBranding) {
        branding = await reportService.getUserBranding(user.id)
        branding = convertToCamel(branding)
      }

      const result = {
        previewUrl,
        reportToken,
        branding,
        ...reportObject,
        months: monthsResults,
        years: yearsResults,
        propertyTypes,
      }

      res.json(result);

    } catch (error) {
      fail(res, error);
    }
  },
}
