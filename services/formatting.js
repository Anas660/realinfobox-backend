const self = module.exports = {
  toUnderscoreCase: (input) => input.replace(/\.?([A-Z]+)/g, function (x,y){return "_" + y.toLowerCase()}).replace(/^_/, ""),
  snakeToCamel: (str) => str.replace(
    /([-_][a-z])/g,
    (group) => group.toUpperCase()
      .replace('-', '')
      .replace('_', ''),
  ),

  convertToCamel: (obj) => {
    const result = {}
    if (!obj) return obj;
    Object.keys(obj).forEach(key => {
      const camelCaseKey = self.snakeToCamel(key)
      result[camelCaseKey] = obj[key]
    })
    return result
  },
}
