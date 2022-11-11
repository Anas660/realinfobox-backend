'use strict';

const calgaryRegionsConfig = require('../config/calgaryCityRegions.json')
const winnipegStructure = require('../config/winnipegStructure.json')
const edmontonConfig = require('../config/edmontonConfig')

const xlsx = require('node-xlsx');
const _ = require('lodash')
const dfns = require('date-fns')
const md5 = require('md5');
const dynamo = require('./aws/dynamo');
const axios = require('axios');
const edmontonStructure = require('../config/edmontonStructure');

const {
  APP_TABLE,
} = process.env;

const colMap = {
  0: 'name', //A column
  2: 'sold', //C
  8: 'active', //I
  9: 'dom', //J
  17: 'benchmarkPrice', //R
  20: 'benchmarkPriceYTD', //U
}
const colMapKeys = Object.keys(colMap)

const self = module.exports = {
  defaultFields: [
    'sold',
    'active',
    'dom',
    'benchmarkPrice',
    'benchmarkPriceYTD',
  ],
  propertyTypes: {
    calgary: ['detached', 'semi-detached', 'row', 'apartment'],
    edmonton: [...edmontonConfig.propertyClasses.map(pc => pc.displayName), 'duplex'],
    winnipeg: ['detached', 'attached', 'condo'],
    victoria: ['detached', 'row', 'condo', 'residential'],
    vancouver: ['detached', 'townhome', 'apartment'],
    'fraser-valley': ['detached', 'townhome', 'apartment'],
  },
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
  getDateStr: (year, month) => `${year}-${month.toString().padStart(2, '0')}`,
  getUserBranding: async (userId) => {
    try {
      let defaultBranding = {
        bannerType: 'simple',
        customBannerUrl: null,
        logoUrl: null,
        backgroundUrl: null,
        agentPhotoUrl: null,
        color1: '#e15226',
        color2: '#4a4a4a',
        color3: '#dedede',
        name: 'John Doe',
        title: 'MD.',
        company: 'Company Inc.',
        phone: '123-456-789',
        website: 'website.org',
        email: 'john.doe@mail.mail',
        bannerHeight: 200,
      };
      const branding = await dynamo.getOne(APP_TABLE, {
        pk: `USER|${userId}`,
        sk: 'REPORT_BRANDING',
      })

      return branding || defaultBranding
    } catch (error) {
      throw error
    }
  },
  putUserBranding: async (userId, params) => {
    try {
      const {
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
        bannerHeight
      } = params

      const item = {
        pk: `USER|${userId}`,
        sk: 'REPORT_BRANDING',
        color1,
        color2,
        color3,
        name,
        title,
        company,
        phone,
        website,
        email,
        banner_height: bannerHeight,
        banner_type: bannerType,
        custom_banner_url: customBannerUrl,
        logo_url: logoUrl,
        background_url: backgroundUrl,
        agent_photo_url: agentPhotoUrl,
      }

      const result = await dynamo.put(APP_TABLE, item)


      return true
    } catch (error) {
      throw error
    }
  },

  calgaryParseXLSX: async (data) => {
    try {
      const parsedData = xlsx.parse(data)

      if (!parsedData.length || !parsedData[0].data[2]) throw 'Invalid XLSX'
      const regionNames = Object.keys(calgaryRegionsConfig)

      const sheetNames = parsedData.map(pd => pd.name.toLowerCase())
      const propertyTypes = sheetNames
      const colNames = parsedData[0].data[2]
      const msTimestamp = Math.floor((colNames[2] - 25569) * 8.64e7) //get timestamp from XLSX date format
      const fileDate = new Date(msTimestamp)
      const fileMonth = fileDate.getMonth() + 1
      const fileYear = fileDate.getFullYear()

      const calgaryData = {}

      parsedData.forEach((sheet) => {
        const sheetData = sheet.data
        sheetData.shift() // remove row 1
        sheetData.shift() // remove row 2
        sheetData.shift() // remove column names

        const getRowData = (name) => {
          const index = sheetData.findIndex(r => r[0] === name)
          const data = {}
          colMapKeys.forEach(columnIndex => {
            const fieldName = colMap[columnIndex]
            if (!sheetData[index]) return
            const value = sheetData[index][columnIndex]
            data[fieldName] =
              (isNaN(value))
                ? 0
                : parseInt((1 * value).toFixed(0))

          })
          return {...data, updatedAt: new Date().toISOString()}
        }

        const regionData = {}
        regionNames.forEach(region => {
          const areas = {}
          Object.keys(calgaryRegionsConfig[region]).forEach(area => {
            const communities = {}
            const commsArray = calgaryRegionsConfig[region][area]
            commsArray.forEach(communityName => {
              communities[communityName] = {
                data: getRowData(communityName),
              }
            }),

              areas[area] = {
                data: getRowData(area),
                communities,
              }
          })

          regionData[region] = {
            data: getRowData(region),
            areas,
          }
        })
        calgaryData[sheet.name.toLowerCase()] = regionData
      })

      // done getting the data, organize it, put all sheet data under particular areas etc.
      const calgaryDataParsed = {
        attributes: {
          month: fileMonth,
          year: fileYear,
          propertyTypes,
        },
        data: {
          regions: {},
        },
      }
      const organized = {}

      const getObjData = (pathArray) => {
        const data = {}
        propertyTypes.forEach(propertyType => {
          data[propertyType] = _.get(calgaryData, [propertyType, ...pathArray, 'data'], 'N/A')
        })
        return data
      }

      regionNames.forEach(regionName => {
        const regionData = getObjData([regionName])

        const areas = {}
        const area = calgaryRegionsConfig[regionName];
        const areaNames = Object.keys(area)
        areaNames.forEach(areaName => {
          const communities = {}

          const communityNames = calgaryRegionsConfig[regionName][areaName]
          communityNames.forEach(communityName => {
            communities[communityName] = {
              type: 'community',
              name: communityName,
              data: getObjData([regionName, 'areas', areaName, 'communities', communityName]),
            }
          })

          areas[areaName] = {
            type: 'area',
            name: areaName,
            data: getObjData([regionName, 'areas', areaName]),
            communities,
          }
        })

        organized[regionName] = {
          data: regionData,
          areas,
        }
      })

      calgaryDataParsed.data.regions = organized
      return calgaryDataParsed
    } catch (error) {
      throw error
    }
  },

  calgarySaveOrganizedData: async (organizedData) => {
    try {
      const dateString = self.getDateStr(organizedData.attributes.year, organizedData.attributes.month)
      const hashedDate = md5(dateString)
      const pk = `REPORT|CALGARY|${dateString}`
      const toPut = [
        {
          pk,
          sk: 'ATTRIBUTES',
          entity: 'REPORT',
          city: 'calgary',
          hash: hashedDate,
          date: dateString,
          ...organizedData.attributes,
        },
        {
          pk,
          sk: 'DATA',
          entity: 'REPORT',
          ...organizedData.data,
        },
      ]

      await dynamo.batchWrite(APP_TABLE, toPut)
      return {};
    } catch (error) {
      console.error(error)
      throw error
    }
  },

  getCalgaryStructure: () => {
    const regions = Object.keys(calgaryRegionsConfig).map(regionName => {
      const areas = Object.keys(calgaryRegionsConfig[regionName]).map(areaName => {
        const communities = calgaryRegionsConfig[regionName][areaName].map(commName => {
          return {
            name: commName,
            type: 'community',
          }
        })
        return {
          name: areaName,
          type: 'area',
          communities,
        }
      })

      return {
        name: regionName,
        type: 'region',
        areas,
      }
    })

    let calgary = {
      name: 'City of Calgary',
      type: 'city',
      regions,
    }

    const calgaryIndex = regions.findIndex(reg => reg.name === 'City of Calgary')
    if (~calgaryIndex) {
      calgary.areas = regions[calgaryIndex].areas
      regions.splice(calgaryIndex, 1)
    }

    return calgary
  },
  getWinnipegLocationData: (statistic, locationName) => {
    const location = locationName.toLowerCase();

    const areas = ['downtown', 'north', 'west', 'south west', 'south east', 'north east'];

    if(location === "winnipeg"){
      return statistic?.winnipeg?.data;
    }else if(location === "rural municipality"){
      return statistic?.winnipeg?.rural?.data;
    }else if(areas.includes(location)){
      return statistic?.winnipeg?.areas[locationName];
    }else{
      return statistic?.winnipeg?.rural?.regions[locationName];
    }

    return;
  },
  winnipegDetail: async (locationName) => {
    const statistics = await dynamo.getPkBeginsWithReverse(APP_TABLE, 'DATA', 'REPORT|WINNIPEG');

    const mapped = statistics.map( (statistic) => {
      const attrs = {
        date: statistic?.date,
        month: statistic?.month,
        year: statistic?.year,
      };

      const data = self.getWinnipegLocationData(statistic, locationName);
      return {...data, attrs};
    });

    return {
      months: mapped,
    };
  },
  winnipegCityDetail: async (year, month) => {
    const statistics = await dynamo.getOne(APP_TABLE, {pk: `REPORT|WINNIPEG|${year}-${month}`, sk: 'DATA'});

    if(!statistics?.winnipeg?.data){
      return;
    }

    return statistics?.winnipeg?.data;
  },
  updateWinnipegCityDetail: async (data, year, month) => {
    const statistics = await dynamo.getOne(APP_TABLE, {pk: `REPORT|WINNIPEG|${year}-${month}`, sk: 'DATA'});

    if(!statistics){
      await dynamo.put(APP_TABLE, {
        pk: `REPORT|WINNIPEG|${year}-${month}`,
        sk: 'DATA',
        entity: 'REPORT',
        city: 'winnipeg',
        winnipeg: {
          data,
        },
      })
      return;
    }

    await dynamo.put(APP_TABLE, {
      ...statistics,
      winnipeg: {
        ...statistics.winnipeg,
        data,
      },
    })
  },
  winnipegStructure: () => {
    const regions = Object.keys(winnipegStructure).map(regionName => {
      const areas = Object.keys(winnipegStructure[regionName]).map(areaName => {
        const regions = winnipegStructure[regionName][areaName].map(commName => {
          return {
            name: commName,
            type: 'community',
          }
        })
        return {
          name: areaName,
          type: 'area',
          regions,
        }
      });

      return {
        name: regionName,
        areas,
      }
    });

    return _.first(regions);
  },

  loadCalgaryNMonths: async (locationName, lastDate, n = 14) => {
    try {
      const lenArr = (new Array(n)).fill()
      let path
      const monthsArr = await Promise.all(lenArr
        .map(async (x, index) => {
          try {
            const currentDate = dfns.subMonths(lastDate, index)
            const month = currentDate.getMonth() + 1;
            const year = currentDate.getFullYear();
            const dateStr = self.getDateStr(year, month)

            const result = await self.getCalgaryDateData(dateStr) || null
            const resData = {
              data: (result && result.data) ? result.data : {},
              attrs: {
                date: dateStr,
                month,
                year,
              },
            }

            if (Object.values(resData).length && !path) {
              path = self.getLocationPath(locationName, resData.data)
            }

            return resData
          } catch (error) {
            console.error(error)
          }
        }),
      )
      const months = {}
      monthsArr.forEach(async (month) => {
        const monthData = _.get(month.data, path)
        const attrs = month.attrs
        let data
        if (monthData) {
          data = monthData.data
        }

        // if (data) {
        //   data.all = self.sumLocationData(data)
        // }

        months[attrs.date] = {
          data,
          attrs,
        }
      })

      return months
    } catch (error) {
      throw error
    }
  },
  loadCalgaryNYears: async (locationName, lastDate, n = 11) => {
    try {
      const lenArr = (new Array(n)).fill()
      let path
      const yearsArr = await Promise.all(lenArr
        .map(async (x, index) => {
          try {
            const currentDate = dfns.subYears(lastDate, index)
            const month = !index ? currentDate.getMonth() + 1 : 12;
            const year = currentDate.getFullYear();
            const dateStr = self.getDateStr(year, month)

            const result = await self.getCalgaryDateData(dateStr) || null
            const resData = {
              data: (result && result.data) ? result.data : {},
              attrs: {
                date: dateStr,
                month,
                year,
              },
            }

            if (Object.values(resData).length && !path) {
              path = self.getLocationPath(locationName, resData.data)
            }

            return resData
          } catch (error) {
            console.error(error)
          }
        }),
      )

      const years = {}
      yearsArr.forEach(async (year) => {
        const yearData = _.get(year.data, path)
        const attrs = year.attrs
        let data
        if (yearData) {
          data = yearData.data
        }

        // if (data) {
        //   data.all = self.sumLocationData(data)
        // }

        years[attrs.year] = {
          data,
          attrs,
        }
      })

      return years
    } catch (error) {
      throw error
    }
  },
  sumLocationData: (locationData) => {
    if (!locationData) return {}
    const all = {}
    const dataArray = Object.values(locationData)
    const sumFields = ['sold', 'active']
    const avgFields = ['dom', 'benchmarkPriceYTD', 'benchmarkPrice']
    sumFields.forEach(field => {
      all[field] = _.sumBy(dataArray, field)
    })
    avgFields.forEach(field => {
      all[field] = _.meanBy(dataArray, field)
    })
    return all
  },
  getLocationPath: (locationName, locationData) => {
    if (!locationData || !Object.keys(locationData).length) return false
    const regions = locationData.regions
    const path = ['regions']

    // console.log('regions', regions)
    if (regions[locationName]) {
      path.push(locationName)
      return path
    }

    for (const regionName of Object.keys(regions)) {
      const regionData = regions[regionName]
      const areas = regionData.areas
      // console.log('areas', areas)
      if (areas && areas[locationName]) {
        path.push(regionName, 'areas', locationName)
        return path
      }

      for (const areaData of Object.values(areas)) {
        const communities = areaData.communities
        // console.log('communities', communities)

        if (communities && communities[locationName]) {
          path.push(
            regionName,
            'areas',
            areaData.name,
            'communities',
            locationName,
          )
          return path
        }

      }
    }
    path.push(locationName)
    return path
  },
  getLocation: async (locationData, level = 'communities') => {
    const locationLevel = {}
    const regions = locationData.regions
    const returnArray = []
    Object.keys(regions).forEach(regionName => {
      const regionData = regions[regionName]
      const areas = regionData.areas
      returnData[regionName] = regionData
    });
  },

  getCalgaryDateData: async (date) => {
    try {
      const found = await dynamo.getByPk(APP_TABLE, `REPORT|CALGARY|${date}`)
      if (!found || !found.length)
        return undefined

      const attrsRow = found.find(ga => ga.sk === 'ATTRIBUTES')
      const dataRow = found.find(ga => ga.sk === 'DATA')

      const omit = ['pk', 'sk', 'entity']

      const data = _.omit(dataRow, omit);

      return {
        attributes: _.omit(attrsRow, omit),
        data: data,
      };
    } catch (error) {
      throw error
    }
  },

  getMDRanges: async (city) => {
    try {
      const keys = {
        pk: `REPORT|${city.toUpperCase()}`,
        sk: `MARKET_DISTRIBUTION_RANGES`,
      }
      const result = await dynamo.getOne(APP_TABLE, keys)
      return result ? _.omit(result, ['pk', 'sk', 'entity']) : undefined
    } catch (error) {
      throw error;
    }
  },
  setMDRanges: async (city, ranges) => {
    try {
      const item = {
        pk: `REPORT|${city.toUpperCase()}`,
        sk: `MARKET_DISTRIBUTION_RANGES`,
        entity: 'REPORT',
        city,
        ranges,
      }

      await dynamo.put(APP_TABLE, item)
      return await self.getMDRanges(city)
    } catch (error) {
      throw error;
    }
  },

  getMDData: async (city, dateString) => {
    try {
      const keys = {
        pk: `REPORT|${city.toUpperCase()}`,
        sk: `MARKET_DISTRIBUTION|${dateString}`,
      }
      const result = await dynamo.getOne(APP_TABLE, keys)
      return result ? _.omit(result, ['pk', 'sk', 'entity']) : undefined
    } catch (error) {
      throw error;
    }
  },

  setMDData: async (city, dateString, data) => {
    try {
      const item = {
        pk: `REPORT|${city.toUpperCase()}`,
        sk: `MARKET_DISTRIBUTION|${dateString}`,
        entity: 'REPORT',
        city,
        date: dateString,
        data,
      }

      await dynamo.put(APP_TABLE, item)
      return await self.getMDData(city, dateString)
    } catch (error) {
      throw error;
    }
  },

  getLastAvailable: async (city) => {
    try {
      const keys = {
        pk: `REPORT|${city.toUpperCase()}`,
        sk: `LAST_AVAILABLE`,
      }
      const result = await dynamo.getOne(APP_TABLE, keys)
      return result ? _.omit(result, ['pk', 'sk', 'entity']) : undefined
    } catch (error) {
      throw error;
    }
  },

  setLastAvailable: async (city, dateString) => {
    try {
      const item = {
        pk: `REPORT|${city.toUpperCase()}`,
        sk: `LAST_AVAILABLE`,
        entity: 'REPORT',
        city,
        date: dateString,
      }

      await dynamo.put(APP_TABLE, item)
      return await self.getLastAvailable(city)
    } catch (error) {
      throw error;
    }
  },

  edmontonImport: async (year, locationName = null) => {
    try {
      const edmontonData = await self.edmontonLoadAspx(year, locationName)
      const edmontonSaveData = await self.edmontonSaveData(edmontonData)

      const months = Array.from({length: 12}, (v, k) => 1 + k)
      await Promise.all(months.map(async month => {
        return await self.fillEdmontonAreaData(year, month);
      }));

      let locations;
      if (locationName) {
        locations = [locationName]
      } else {
        locations = await self.edmontonGetAllLocationNames()
      }
      await Promise.all(locations.map(async (loc) => {
        return await self.calculateEdmontonAveragePriceYTD(loc, year)
      }))

      return edmontonData
    } catch (error) {
      throw error
    }
  },

  edmontonSaveData: async (edmontonData) => {
    try {
      // save cities
      const pk = `REPORT|EDMONTON`
      const citiesToPut = []
      const {propertyClasses} = edmontonConfig;
      const propertyClassNames = propertyClasses.map(pc => pc.displayName)

      const map = {
        city: 'cities',
        md: 'mds',
        community: 'communities',
      }

      const allDone = await Promise.all(Object.keys(map).map(entityType => {
        const entityTypePlural = map[entityType]
        console.log('Processing ' + entityTypePlural)
        if (!edmontonData[entityTypePlural]) return null
        return Promise.all(Object.keys(edmontonData[entityTypePlural]).map(async locationName => {
          const commonObj = {
            pk,
            entity: 'REPORT',
            locationName,
          }
          const location = edmontonData[entityTypePlural][locationName]
          const nameHash = locationName.toUpperCase().replace(' ', '_')
          const attributes = location.attributes
          const {year} = attributes
          const locationData = location.data
          const toPut = [
            {
              ...commonObj,
              sk: `ATTRIBUTES|${nameHash}`,
              locationType: entityType,
              ...attributes,
              city: 'edmonton',
            },
          ]

          for (let month = 1; month <= 12; month++) {
            const toPutObj = {}
            propertyClassNames.forEach(pcn => {
              const propertyDataArray = locationData[pcn]
              const found = propertyDataArray.find(pda => pda.month === month && pda.year === year)
              toPutObj[pcn] = _.omit(found, ['month', 'year']) || {}
            })
            const dateStr = self.getDateStr(year, month)

            if (locationName == 'Edmonton') {
              // Edmonton city is filled manually, only 'active' is loaded automatically - update for that one only
              const currentEdmonton = await self.getEdmontonLocationDateData('Edmonton', dateStr)
              if (currentEdmonton) {
                for (const pcn of propertyClassNames) {
                  const propertyData = currentEdmonton.data[pcn]
                  if (propertyData) {
                    propertyData.active = toPutObj[pcn].active
                  }
                  await dynamo.updateSingleValue(APP_TABLE, {
                    pk,
                    sk: `DATA|${nameHash}|${dateStr}`,
                  }, pcn, propertyData || {})
                }
              } else {
                toPut.push({
                  ...commonObj,
                  sk: `DATA|${nameHash}|${dateStr}`,
                  month,
                  year,
                  ...toPutObj,
                })
              }
            } else {
              //everything else than edmonton city
              toPut.push({
                ...commonObj,
                sk: `DATA|${nameHash}|${dateStr}`,
                month,
                year,
                ...toPutObj,
              })
            }
          }
          citiesToPut.push(...toPut)
          return toPut
        }))
      }))

      if (allDone) {/**/
      }
      console.log('Saving all edmonton stuffs')
      const responses = await dynamo.batchWrite(APP_TABLE, citiesToPut)
      if (responses) {/**/
      }

      return citiesToPut

    } catch (error) {
      throw error
    }
  },

  edmontonFindAreaType: (locationName) => {
    let found = edmontonConfig.communities.find(i => i.name === locationName)
    if (found) {
      return 'community';
    }
    return 'city';
  },

  edmontonLoadAspx: async (year, locationName = null) => {
    try {
      let {cities, mds, communities, propertyClasses} = edmontonConfig;

      const edmontonData = {
        cities: {},
        mds: {},
        communities: {},
      }
      // cities/towns
      let cityNames = cities.map(c => c.name)
      let mdNames = mds.map(c => c.name)

      if (locationName) {
        if (cityNames.includes(locationName)) {
          cityNames = [locationName];
          mdNames = [];
          communities = [];
        }
        if (mdNames.includes(locationName)) {
          cityNames = [];
          mdNames = [locationName];
          communities = [];
        }
        if (communities.map(c => c.name).includes(locationName)) {
          cityNames = [];
          mdNames = [];
          communities = [communities.find(c => c.name === locationName)];
        }
      }

      const allCities = Promise.all(cityNames.map(async (city, index) => {
        if (index === 0)
          console.log('Loading cities - start')
        const cityData = {
          attributes: {
            name: city,
            year,
          },
          data: {},
        }
        for (const propertyClass of propertyClasses) {
          cityData.data[propertyClass.displayName] = await self.getMlsEnsightData(city, 'city', propertyClass.propertyName, year)
        }
        edmontonData.cities[city] = cityData
        if (index === cityNames.length - 1)
          console.log('Loading cities - done')
        return cityData;
      }))

      // municipal districts
      const allMds = Promise.all(mdNames.map(async (md, index) => {
        if (index === 0)
          console.log('Loading mds - start')

        const mdData = {
          attributes: {
            name: md,
            year,
          },
          data: {},
        }
        for (const propertyClass of propertyClasses) {
          mdData.data[propertyClass.displayName] = await self.getMlsEnsightData(md, 'city', propertyClass.propertyName, year)
        }
        edmontonData.mds[md] = mdData
        if (index === mdNames.length - 1)

          console.log('Loading mds - done')

        return mdData;
      }))

      const allComms = Promise.all(communities.map(async (comm, index) => {
        if (index === 0)
          console.log('Loading communities - start')
        const commName = comm.name
        const commData = {
          attributes: {
            ...comm,
            year,
          },
          data: {},
        }
        for (const propertyClass of propertyClasses) {
          commData.data[propertyClass.displayName] = await self.getMlsEnsightData(commName, 'Community', propertyClass.propertyName, year)
        }
        edmontonData.communities[commName] = commData
        if (index === communities.length - 1)
          console.log('Loading communities - done')
        return commData;
      }))

      const allDone = await Promise.all([
        allCities,
        allMds,
        allComms,
      ])
      if (allDone) {/**/
      }

      // console.log(data)
      return edmontonData
    } catch (error) {
      console.error(error)
      throw error
    }

  },

  getMlsEnsightUrl: (areaName) => {
    const areaType = self.edmontonFindAreaType(areaName);
    const encodedAreaName = encodeURIComponent(areaName);
    return `https://www.mlsensight.com/heatmap/crdev/default_v1.html?m=71&l=3433&City=edmonton&UID=egalanmi&mWd=940&y=${encodedAreaName}&type=${areaType}`;
  },

  getMlsEnsightData: async (areaName, areaType, propertyName, year, month = 12) => {
    try {

      const baseUrl = 'http://www.mlsensight.com/heatmap/crdev/data/ReceiveMLSInfo.aspx';
      const params = {
        servicecode: 10017,
        format: 'json',
        title: areaName,
        ismonth: 1,
        istime: 1, // 0 loads just last 2 months, 1 whole year
        isold: 1,
        SelectYear: year,
        months: month,
        mapname: 71,
        type: areaType,
        property: 2,
        propertyname: propertyName,
        IsCommunity: areaType === 'Community' ? 1 : 0,
      }
      const {data} = await axios.get(baseUrl, {params})
      const {fieldsMap} = edmontonConfig;

      const months = data;

      const result = months.map((month) => {
        const mappedMonth = {}
        const picked = _.pick(month, ['month', 'year'])
        Object.keys(picked).forEach(p => {
          picked[p] = parseInt(picked[p])
        })
        Object.keys(fieldsMap).forEach(field => {
          mappedMonth[fieldsMap[field]] = parseInt(month[field]) || 0
        })
        return {
          ...mappedMonth,
          ...picked,
        }
      })

      return result
    } catch (error) {
      console.log(error)
      throw error
    }
  },
  createEdmontonStructure: () => {
    const {cities, communities, mds} = edmontonConfig;
    const structure = {
      name: "Edmonton",
      type: 'city',
      cities: [],
      areas: [],
      communities: [],
      mds,
    }
    //fill cities
    cities.forEach(city => {
      if (city.name === 'Edmonton') return;
      structure.cities.push({
        name: city.name,
        type: 'city',
        communities: [],
      })
    })

    const getCityIndex = (name) => {
      const cityIndex = structure.cities.findIndex(a => a.name === name);
      return cityIndex
    }

    //fill areas
    communities.forEach(comm => {
      const obj = {
        name: comm.area,
        type: 'area',
        communities: [],
      }

      if (comm.area) {
        if (comm.city === 'Edmonton') {

          const areaIndex = structure.areas.findIndex(a => a.name === comm.area);
          if (!~areaIndex) {
            structure.areas.push(obj)
          }
        } else {
          // this probably never happens
          console.log('this never happens')
          // const cityIndex = getCityIndex(comm.city);
          // if (~cityIndex) {
          //   const areaIndex = structure.cities[cityIndex].areas.findIndex(a => a.name === comm.area);
          //   if (!~areaIndex) {
          //     structure.cities[cityIndex].areas.push(obj)
          //   }
          // }
        }
      }
    })

    //fill communities
    communities.forEach(comm => {
      const obj = {
        name: comm.name,
        type: 'community',
        area: comm.area,
        zone: comm.zone,
        code: comm.code,
      }
      if (comm.city === 'Edmonton') {
        if (comm.area) {
          const areaIndex = structure.areas.findIndex(a => a.name === comm.area);
          if (~areaIndex) {
            structure.areas[areaIndex].communities.push(obj)
          }
        } else {
          structure.communities.push(obj)
        }

      } else {
        if (comm.area) {
          const cityIndex = getCityIndex(comm.city);
          if (~cityIndex) {
            const areaIndex = structure.cities[cityIndex].areas.findIndex(a => a.name === comm.area);
            if (~areaIndex) {
              structure.cities[cityIndex].areas[areaIndex].communities.push(obj)
            }
          }

        } else {
          const cityIndex = getCityIndex(comm.city);
          if (~cityIndex) {
            structure.cities[cityIndex].communities.push(obj)
          }
        }
      }
    })

    structure.areas = structure.areas.map(area => {
      const comms = area.communities
      const grouped = _.groupBy(comms, 'zone')
      delete area.communities
      const zones = []
      Object.keys(grouped).forEach(zoneId => {
        zones.push({
          zoneId: parseInt(zoneId),
          name: `Zone ${zoneId}`,
          type: 'zone',
          communities: grouped[zoneId],
        })
      })
      return {
        ...area,
        zones,
      }
    })
    return structure
  },

  loadEdmontonNMonths: async (locationName, lastDate, n = 14) => {
    try {
      const lenArr = (new Array(n)).fill()
      const monthsArr = await Promise.all(lenArr
        .map(async (x, index) => {
          try {
            const currentDate = dfns.subMonths(lastDate, index)
            const month = currentDate.getMonth() + 1;
            const year = currentDate.getFullYear();
            const dateStr = self.getDateStr(year, month)

            const result = await self.getEdmontonLocationDateData(locationName, dateStr) || null
            const resData = {
              data: (result && result.data) ? result.data : {},
              attrs: {
                date: dateStr,
                month,
                year,
                locationType: result.attributes.locationType || result.attributes.propertyClass,
              },
            }

            return resData
          } catch (error) {
            console.error(error)
          }
        }),
      )
      const months = {}
      monthsArr.forEach(async (month) => {
        const monthData = month.data
        const attrs = month.attrs
        let data
        if (monthData) {
          data = monthData
        }
        months[attrs.date] = {
          data,
          attrs,
        }
      })

      return months
    } catch (error) {
      throw error
    }
  },
  loadEdmontonNYears: async (locationName, lastDate, n = 11) => {
    try {
      const lenArr = (new Array(n)).fill()
      const yearsArr = await Promise.all(lenArr
        .map(async (x, index) => {
          try {
            const currentDate = dfns.subYears(lastDate, index)
            const month = !index ? currentDate.getMonth() + 1 : 12;
            const year = currentDate.getFullYear();
            const dateStr = self.getDateStr(year, month)
            const result = await self.getEdmontonLocationDateData(locationName, dateStr) || null
            const resData = {
              data: (result && result.data) ? result.data : {},
              attrs: {
                date: dateStr,
                month,
                year,
              },
            }
            return resData
          } catch (error) {
            console.error(error)
          }
        }),
      )

      const years = {}
      yearsArr.forEach(async (year) => {
        const yearData = year.data
        const attrs = year.attrs
        let data
        if (yearData) {
          data = yearData
        }

        years[attrs.year] = {
          data,
          attrs,
        }
      })

      return years
    } catch (error) {
      throw error
    }
  },
  getEdmontonLocationDateData: async (locationName, dateStr) => {
    try {
      const nameHash = locationName.toUpperCase().replace(' ', '_')
      const dataRow = await dynamo.getOne(APP_TABLE, {
        pk: `REPORT|EDMONTON`,
        sk: `DATA|${nameHash}|${dateStr}`,
      })
      const attrsRow = await dynamo.getOne(APP_TABLE, {
        pk: `REPORT|EDMONTON`,
        sk: `ATTRIBUTES|${nameHash}`,
      })

      const omit = ['pk', 'sk', 'entity']

      const data = _.omit(dataRow, omit);

      return {
        attributes: _.omit(attrsRow, omit),
        data: data,
      };
    } catch (error) {
      throw error
    }
  },
  getDelta: (curVal, prevVal) => {
    if (!curVal && !prevVal && curVal !== 0) return 0
    if (!prevVal && prevVal !== 0) return null
    let result = self.toFloat(100 * (curVal - prevVal) / prevVal)
    return result
  },
  toFloat: (val) => {
    if (!val) return val
    return parseFloat(val.toFixed(2))
  },
  calculateReportMonthsData: (months, propertyTypes, marketDistribution = null) => {
    const monthsResults = []
    const monthKeys = Object.keys(months).sort()

    for (let i = 1; i < monthKeys.length; i++) {
      const prevMonthKey = monthKeys[i - 1]
      const monthKey = monthKeys[i]
      const prevMonth = months[prevMonthKey]
      const currentMonth = months[monthKey]

      const currentMonthMarketStatus = {
        attrs: currentMonth.attrs,
      }

      for (const pt of propertyTypes) {
        let propObject = self.reportDataFields()

        if (currentMonth && currentMonth.data && currentMonth.data[pt]) {
          const currentProp = currentMonth.data[pt]
          propObject = {...propObject, ...currentProp}

          // market status
          propObject.soldPercent = self.toFloat(100 * currentProp.sold / currentProp.active)
          propObject.unsoldPercent = self.toFloat(100 - propObject.soldPercent)

          // sometimes sold percent is over 100% becaus eof some administrative shifting
          if (propObject.unsoldPercent < 0)
            propObject.unsoldPercent = 0

          if (prevMonth && prevMonth.data && prevMonth.data[pt]) {
            const prevProp = prevMonth.data[pt]
            const prevMonthSoldPercent = self.toFloat(100 * prevProp.sold / prevProp.active)
            propObject.soldDelta = self.getDelta(propObject.sold, prevProp.sold)
            propObject.activeDelta = self.getDelta(propObject.active, prevProp.active)
            propObject.soldPercentDelta = self.getDelta(propObject.soldPercent, prevMonthSoldPercent)
            propObject.benchmarkPriceDelta = self.getDelta(propObject.benchmarkPrice, prevProp.benchmarkPrice)
            propObject.benchmarkPriceYTDDelta = self.getDelta(propObject.benchmarkPriceYTD, prevProp.benchmarkPriceYTD)
            propObject.domDelta = self.getDelta(propObject.dom, prevProp.dom)
          }

          let markDist = marketDistribution;
          //stuff relevant only on last month
          if (i === monthKeys.length - 1) {
            if (markDist) {
              let totalSold = 0;
              const mdMap = markDist.data.map(mdRange => {
                // recent change to prop naming fallback
                let mdValue = mdRange[pt]
                if (!mdValue && pt === 'semi-detached')
                  mdValue = mdRange['semi']

                totalSold += 1 * mdValue;

                return {
                  rangeFrom: 1 * mdRange['rangeFrom'],
                  value: 1 * mdValue,
                }
              })
              propObject.marketDistribution = mdMap.map((md) => {
                return {
                  ...md,
                  percent: md.value ? self.toFloat(100 * md.value / totalSold) : null,
                }
              })
            }

            propObject.benchmarkPriceYTYDelta = null
            propObject.activeYTYDelta = null
            propObject.soldYTYDelta = null
            propObject.soldPercentYTYDelta = null
            propObject.domYTYDelta = null
            // if we have data from last year month, add benchmark price YTY delta
            const lastYearMonth = months[`${currentMonth.attrs.year - 1}-${`${currentMonth.attrs.month}`.padStart(2, '0')}`]
            if (lastYearMonth && lastYearMonth.data && lastYearMonth.data[pt]) {
              const lastYearProp = lastYearMonth.data[pt]
              const lastYearSoldPercent = self.toFloat(100 * lastYearProp.sold / lastYearProp.active)

              propObject.benchmarkPriceYTYDelta = self.getDelta(propObject.benchmarkPrice, lastYearProp.benchmarkPrice)
              propObject.activeYTYDelta = self.getDelta(propObject.active, lastYearProp.active)
              propObject.soldYTYDelta = self.getDelta(propObject.sold, lastYearProp.sold)
              propObject.soldPercentYTYDelta = self.getDelta(propObject.soldPercent, lastYearSoldPercent)
              propObject.domYTYDelta = self.getDelta(propObject.dom, lastYearProp.dom)
            }
          }
        }
        currentMonthMarketStatus[pt] = propObject
      }
      monthsResults.push(currentMonthMarketStatus)
    }

    return monthsResults
  },
  calculateReportYearsData: (years, propertyTypes) => {
    const yearsKeys = Object.keys(years).sort()
    const yearsResults = []
    let benchmarkPriceTotalDelta = null
    const firstYear = years[yearsKeys[1]]
    const lastYear = years[yearsKeys[yearsKeys.length - 1]]

    for (let i = 1; i < yearsKeys.length; i++) {
      const prevYearKey = yearsKeys[i - 1]
      const yearKey = yearsKeys[i]
      const prevYear = years[prevYearKey]
      const currentYear = years[yearKey]

      const currentYearObj = {
        attrs: currentYear.attrs,
      }

      for (const pt of propertyTypes) {
        let propObject = {
          benchmarkPriceYTD: null,
          benchmarkPriceYTDDelta: null,
        }

        if (currentYear && currentYear.data && currentYear.data[pt]) {
          const currentProp = currentYear.data[pt]
          propObject.benchmarkPriceYTD = currentProp.benchmarkPriceYTD

          if (prevYear && prevYear.data && Object.keys(prevYear.data).length && prevYear.data[pt]) {
            const prevProp = prevYear.data[pt]
            propObject.benchmarkPriceYTDDelta = self.getDelta(propObject.benchmarkPriceYTD, prevProp.benchmarkPriceYTD)
          }
        }

        if (i === yearsKeys.length - 1) {
          //on last index add data
          if (firstYear && lastYear && firstYear.data && lastYear.data && firstYear.data[pt] && lastYear.data[pt]) {
            benchmarkPriceTotalDelta = self.getDelta(lastYear.data[pt].benchmarkPriceYTD, firstYear.data[pt].benchmarkPriceYTD)
          }

          propObject.benchmarkPriceTotalDelta = benchmarkPriceTotalDelta
        }

        currentYearObj[pt] = propObject

      }
      yearsResults.push(currentYearObj)
    }
    return yearsResults
  },
  fillEdmontonAreaData: async (year, month) => {
    console.log('Filling area data...');
    const propertyTypes = self.propertyTypes.edmonton

    const structure = edmontonStructure;
    const allAreas = structure.areas;
    const allZones = _.flatten(allAreas.map(a => a.zones))

    // fill zones first
    const zonesArray = await Promise.all(allZones.map(async zone => {
      const {name, communities} = zone
      const commData = await Promise.all(communities.map(async community => {
        const dateStr = self.getDateStr(year, month)
        console.log('filling ' + community.name);
        return await self.getEdmontonLocationDateData(community.name, dateStr)
      }))

      const zoneData = {}
      propertyTypes.forEach(pt => {
        if (pt === 'duplex') return true; //duplex is ommited
        zoneData[pt] = {
          sold: _.sumBy(commData, c => {
            let cdata = c.data[pt]
            try {
              return c.data[pt] ? c.data[pt].sold : 0
            } catch (error) {
              console.log(c.data)
              console.log(cdata)
              console.log(pt)
            }

          }) || null,
          active: _.sumBy(commData, c => c.data[pt] ? c.data[pt].active : 0) || null,
          dom: _.round(_.meanBy(commData, c => c.data[pt] ? c.data[pt].dom : null) || null),
          benchmarkPrice: _.round(_.meanBy(commData, c => c.data[pt] ? c.data[pt].benchmarkPrice : null)) || null,
        }

      })
      const zoneAttrs = _.omit(zone, ['communities'])
      return await self.saveEdmontonLocationData(name, 'zone', year, month, zoneAttrs, zoneData)
    }))

    const areas = await Promise.all(allAreas.map(async area => {
      const {name, zones} = area
      const areaZonesNames = zones.map(z => z.name)
      const areaZonesData = zonesArray.filter(z => areaZonesNames.includes(z.attributes.name))
      const areaData = {}
      propertyTypes.forEach(pt => {
        if (pt === 'duplex') return true; //duplex is ommited
        areaData[pt] = {
          sold: _.sumBy(areaZonesData, c => c.data[pt].sold) || null,
          active: _.sumBy(areaZonesData, c => c.data[pt].active) || null,
          dom: _.round(_.meanBy(areaZonesData, c => c.data[pt].dom)) || null,
          benchmarkPrice: _.round(_.meanBy(areaZonesData, c => c.data[pt].benchmarkPrice)) || null,
        }
      })
      const areaAttrs = _.omit(area, ['zones'])
      return await self.saveEdmontonLocationData(name, 'area', year, month, areaAttrs, areaData)
    }))

    console.log('Area data filled')
    return areas;
  },

  saveEdmontonLocationData: async (locationName, type, year, month, attributes, data) => {
    const pk = `REPORT|EDMONTON`
    const commonObj = {
      pk,
      entity: 'REPORT',
      locationName,
    }
    const nameHash = locationName.toUpperCase().replace(' ', '_')
    const dateStr = self.getDateStr(year, month)
    const toPut = [
      {
        ...commonObj,
        sk: `ATTRIBUTES|${nameHash}`,
        locationType: type,
        ...attributes,
        city: 'edmonton',
      },
      {
        ...commonObj,
        sk: `DATA|${nameHash}|${dateStr}`,
        month,
        year,
        ...data,
      },
    ]
    try {
      await dynamo.batchWrite(APP_TABLE, toPut)
    } catch (error) {
      console.log(toPut)
      throw error
    }
    return {
      attributes: toPut[0],
      data: toPut[1],
    }
  },
  edmontonGetAllLocationNames: async () => {
    const places = await dynamo.getSkBeginsWith(APP_TABLE, 'REPORT|EDMONTON', 'ATTRIBUTES|')
    const locationNames = _.uniq(places.map(p => p.locationName))
    return locationNames
  },
  calculateEdmontonAveragePriceYTD: async (locationName, year, startMonth = 1) => {
    // note: the benchmarkPrice field is used for edmonton average price
    console.log('-- Recalculating average YTD: ' + locationName + ' ' + year)
    const propertyTypes = self.propertyTypes.edmonton.filter(pt => {
      if (pt === 'duplex' && locationName !== 'Edmonton') return false;
      return true
    })
    const lastDate = dfns.startOfMonth(new Date(year, 11))
    //get data for whole year
    const locationDataYear = await self.loadEdmontonNMonths(locationName, lastDate, 12)
    const dataArray = _.orderBy(
      Object.values(locationDataYear),
      (d) => self.getDateStr(d.attrs.year, d.attrs.month),
    )

    // walk through months jan->dec, slicing the months until then
    for (let i = startMonth - 1; i < dataArray.length; i++) {
      const month = i + 1;
      const partialYearArray = dataArray.slice(0, month)

      //finally for each property type do an average of previous months
      propertyTypes.forEach(pt => {
        if (pt === 'duplex') return; // skip duplex, as it may not be present
        if (!dataArray[i].data[pt]) return; // no data available for this property type
        dataArray[i].data[pt].benchmarkPriceYTD = _.round(_.meanBy(partialYearArray, c => {
          if (!c.data[pt]) {
            return false
          }
          return c.data[pt].benchmarkPrice
        })) || null
      })

      const nameHash = locationName.toUpperCase().replace(' ', '_')
      const dateStr = self.getDateStr(year, month)
      const putObj = {
        pk: `REPORT|EDMONTON`,
        sk: `DATA|${nameHash}|${dateStr}`,
        entity: 'REPORT',
        month,
        year,
        locationName,
        ...dataArray[i].data,
      }
      await dynamo.put(APP_TABLE, putObj)
    }
    console.log('---- Avg YTD Done: ' + locationName)
    return dataArray
  },
  loadCityNMonths: async (cityName, locationName, lastDate, n = 14) => {
    try {
      const cityUpper = cityName.toUpperCase();
      const pk = `REPORT|${cityUpper}`;
      const omit = ['pk', 'sk', 'entity', 'locationName']

      const nameHash = locationName.toUpperCase().replace(' ', '_');
      const lenArr = (new Array(n)).fill()
      const monthsArr = await Promise.all(lenArr
        .map(async (x, index) => {
          try {
            const currentDate = dfns.subMonths(lastDate, index)
            const month = currentDate.getMonth() + 1;
            const year = currentDate.getFullYear();
            const dateStr = self.getDateStr(year, month)

            //get data for current month
            const sk = `DATA|${nameHash}|${dateStr}`;
            const result = _.omit(await dynamo.get({pk, sk}), omit);
            const resData = {
              data: result || {},
              attrs: {
                date: dateStr,
                month,
                year,
              },
            }

            return resData
          } catch (error) {
            console.error(error)
          }
        }),
      )
      const months = {}
      monthsArr.forEach(async (month) => {
        const monthData = month.data
        const attrs = month.attrs
        let data
        if (monthData) {
          data = monthData
        }
        months[attrs.date] = {
          data,
          attrs,
        }
      })

      return months
    } catch (error) {
      throw error
    }
  },
  loadCityNYears: async (cityName, locationName, lastDate, n = 11) => {
    try {
      const cityUpper = cityName.toUpperCase();
      const pk = `REPORT|${cityUpper}`;
      const omit = ['pk', 'sk', 'entity', 'locationName']

      const nameHash = locationName.toUpperCase().replace(' ', '_');

      const lenArr = (new Array(n)).fill()
      const yearsArr = await Promise.all(lenArr
        .map(async (x, index) => {
          try {
            const currentDate = dfns.subYears(lastDate, index)
            const month = !index ? currentDate.getMonth() + 1 : 12;
            const year = currentDate.getFullYear();
            const dateStr = self.getDateStr(year, month)

            //get data for current month
            const sk = `DATA|${nameHash}|${dateStr}`;
            const result = _.omit(await dynamo.get({pk, sk}), omit);
            const resData = {
              data: result || {},
              attrs: {
                date: dateStr,
                month,
                year,
              },
            }
            return resData
          } catch (error) {
            console.error(error)
          }
        }),
      )

      const years = {}
      yearsArr.forEach(async (year) => {
        const yearData = year.data
        const attrs = year.attrs
        let data
        if (yearData) {
          data = yearData
        }

        years[attrs.year] = {
          data,
          attrs,
        }
      })

      return years
    } catch (error) {
      throw error
    }
  },
  getDatabaseCityPath: async (dateStr, locationName) => {
    const result = await self.getCalgaryDateData(dateStr) || null;

    if (!result) return;

    return self.getLocationPath(locationName, result.data);

  },
  updateCalgaryBenchmarkPrice: async (benchmarkPrice, date, region, type) => {
    try {
      const destination = await self.getDatabaseCityPath(date, region);

      if(!destination || destination.length===0) throw Error({
        error:
          {
            code: 422,
            message: 'Location unknown',
          },
      });

      let regionPath = "#region";

      let expressionAttributeNames = {
        '#regions': 'regions',
        '#region': destination[1],
        '#data': 'data',
        '#type': type,
        '#benchmarkPrice': 'benchmarkPrice',
        '#updatedAt': 'updatedAt',
      };

      if(destination.length===6){
        const area = destination[3]
        const community = destination[5]
        regionPath = "#region.#areas.#area.#communities.#community";

        expressionAttributeNames = { ...expressionAttributeNames,
          '#areas': 'areas',
          '#area': area,
          '#communities': 'communities',
          '#community': community,
        };
      }else if(destination.length===4){
        const area = destination[3]

        regionPath = "#region.#areas.#area";

        expressionAttributeNames = { ...expressionAttributeNames,
          '#areas': 'areas',
          '#area': area,
        };
      }

      const params = {
        TableName: APP_TABLE,
        Key: {
          pk: `REPORT|CALGARY|${date}`,
          sk: 'DATA',
        },
        UpdateExpression: `SET #regions.${regionPath}.#data.#type.#benchmarkPrice = :benchmarkPrice, #regions.${regionPath}.#data.#type.#updatedAt = :updatedAt`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: {
          ':benchmarkPrice': benchmarkPrice,
          ':updatedAt': new Date().toISOString(),
        },
      };

      const response = await dynamo.update(params);

      return response;
    } catch (e) {
      throw e;
    }
  },
}
