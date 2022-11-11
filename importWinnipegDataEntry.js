const fetch = require('node-fetch');
const dynamo = require('./services/aws/dynamo');

const {APP_TABLE} = process.env;

/**
 * Scrape, parse and save Winnipeg Data Entry
 * @param event
 * @param context
 * @param callback
 * @returns {Promise<void>}
 */
exports.handler = async (event, context, callback) => {
  try {
    const statistics = await getStatistic();

    if(!statistics.date) return;

    const isImported = await isStatisticImported(statistics.date);

    if (isImported) return;

    await saveWinnipegStatistic(statistics);

    context.done(null, event);

    callback(null, event);

  } catch (error) {
    console.log(error);
  }
};

const isStatisticImported = async (date) => {
  const statistic = await dynamo.getOne(APP_TABLE, {
    pk: `REPORT|WINNIPEG|${date}`,
    sk: `DATA`,
  });

  if (!statistic) return false;

  const areas = statistic.winnipeg.areas;

  if (!areas) return false;

  return true;
}

const getWinnipegStatistic = async (date) => {
  const statistic = await dynamo.getOne(APP_TABLE, {
    pk: `REPORT|WINNIPEG|${date}`,
    sk: `DATA`,
  });

  if (!statistic) return null;

  const winnipeg = statistic?.winnipeg?.data;

  if (!winnipeg) return null;

  return statistic;
}

const saveWinnipegStatistic = async (statistics) => {
  await dynamo.put(APP_TABLE, {
    pk: `REPORT|WINNIPEG|${statistics.date}`,
    sk: 'DATA',
    entity: 'REPORT',
    city: 'winnipeg',
    ...statistics,
  })
}

const parseStatisticDto = (data, winnipegData, winnipegDom) => {
  const areas = ['downtown', 'north', 'west', 'south west', 'south east', 'north east'];
  const rural = ['rural municipality'];

  let winnipeg = {};

  if(winnipegData){
    Object.keys(winnipegData?.winnipeg?.data).map(type => {
      winnipeg = { ...winnipeg, [type]: { ...winnipegData[type], dom: winnipegDom[type] }};
    });
  }else{
    winnipeg = winnipegDom
  }

  let areasData = {};
  let ruralData = {};
  let regionsData = {};


  Object.keys(data).map(area => {
    const parsedArea = area.toLowerCase();

    if(areas.includes(parsedArea)) {
      areasData = { ...areasData, [area]: data[area]};
    }else if(rural.includes(parsedArea)){
      ruralData = data[area];
    } else if(area!=="year" && area!=="month" && area!=="date"){
      regionsData = { ...regionsData, [area]: data[area]};
    }
  });

  const result = {
    date: data.date,
    year: data.year,
    month: data.month,
    winnipeg: {
      data: winnipeg,
      areas: areasData,
      rural: {
        data: ruralData,
        regions: regionsData,
      },
    },
  };

  return result;
}

const getStatistic = async () => {
  const response = await fetch("https://5eptk6inng.execute-api.eu-central-1.amazonaws.com/prod/scraper");
  const areas = ['downtown', 'north', 'west', 'south west', 'south east', 'north east', 'rural municipality'];
  const type = ['attached', 'detached', 'condo'];

  const result = await response.json();

  if (!result) return;

  const data = result.data;

  const parsed = parseStatistics(data);

  const dom = await calculateDOM(parsed, areas, type);

  const winnipeg = await getWinnipegStatistic();

  const dto = await parseStatisticDto(parsed, winnipeg, dom)

  return dto;
}

const calculateDOM = (data, areas, houseTypes) => {

  const parsedData = prepareData(data, areas, houseTypes);

  let result = {};

  Object.keys(parsedData).map(type => {
    const typeData = parsedData[type];

    const dom = weightedAverage(typeData['dom'], typeData['sold']);

    result = { ...result, [type]: { dom: Math.round(dom) }};
  })

  return result;
}

const prepareData = (data, areas, houseTypes) => {
  const initObj = { sold: [], dom: [] };

  let calculationData = {
    [houseTypes[0]]: initObj,
    [houseTypes[1]]: initObj,
    [houseTypes[2]]: initObj,
  };

  Object.keys(data).map(area => {

    const cityArea = area.toLowerCase();

    if (areas.includes(cityArea)) {
      Object.keys(data[area]).map(type => {

        const houseType = data[area][type];

        const houseTypeDataSold = calculationData[type]["sold"];
        const houseTypeDataDom = calculationData[type]["dom"];

        const sold = houseType["sold"] || 0;
        const dom = houseType["dom"] || 0;

        calculationData = {
          ...calculationData, [type]: {
            sold: [...houseTypeDataSold, sold],
            dom: [...houseTypeDataDom, dom],
          },
        }
      })
    }
  });
  return calculationData;
}

const weightedAverage = (nums, weights) => {
  const [sum, weightSum] = weights.reduce(
    (acc, w, i) => {
      acc[0] = acc[0] + nums[i] * w;
      acc[1] = acc[1] + w;
      return acc;
    },
    [0, 0],
  );
  return sum / weightSum;
};

const parseStatistics = (data) => {
  let parsedData = {};
  const {date, ...rest} = data;

  const parsedDate = parseDate(date);

  Object.keys(rest).map(area => {
    let typeValues = {}
    Object.keys(rest[area]).map(type => {
      const houseType = rest[area][type];

      let values = {};
      Object.keys(houseType).map(key => {
        const value = houseType[key];

        const parsedValue = parseNumbers(key, value);
        const parsedKey = parseValueKey(key);

        values = {...values, [parsedKey]: parsedValue}
      });

      const parsedType = parseType(type);
      typeValues = {...typeValues, [parsedType]: values};
    })

    parsedData = {...parsedData, [area]: typeValues};
  });

  return {...parsedData, ...parsedDate};
}

const parseType = (key) => {
  const parsedKey = key.toLowerCase();

  if (parsedKey.includes("detached")) return 'detached';
  if (parsedKey.includes("attached")) return 'attached';
  if (parsedKey.includes("condominium")) return 'condo';

  return "";
}

const parseValueKey = (key) => {
  const parsedKey = key.toLowerCase();

  if (parsedKey === "sales") return 'sold';
  if (parsedKey.includes("new listings")) return 'newListings';
  if (parsedKey.includes("sales to listing ratio")) return 'salesToListingRatio';
  if (parsedKey.includes("average days on market")) return 'dom';
  if (parsedKey.includes("average price")) return 'averagePrice';

  return "";
}

const parseNumbers = (key, data) => {
  if (!data || data === "-" || data === "n/a") return null;

  return Number(data.replace(/[^0-9\.]+/g, ""));
}

const parseDate = (date) => {
  if (!date) return;

  const split = date.split("-");

  const month = split[0];
  const year = split[1];

  if (!month || !year) return;

  const parsedYear = `20${year}`;

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const index = monthNames.indexOf(month);

  const parsedMonth = index + 1;

  return {date: `${parsedYear}-${parsedMonth}`, month: parsedMonth, year: parsedYear}
}