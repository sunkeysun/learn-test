/**
 * koa-transform-path
 */
const { pathToRegexp, parse, compile } = require('path-to-regexp');

module.exports = function({ rules, pathMap, mapSize = 1024 }) {
    if (!(pathMap instanceof Map)) {
        throw new Error('"resultMap" must be a instance of Map');
    }
    if (!rules || !rules.length) {
        throw new Error('"rules" must be a non-empty array');
    }
 
    const rulesList = rules.map((rulesItem) => {
        const parsedSourceReg = parse(rulesItem.source);
        const isRegPath = parsedSourceReg.length > 1;
        return {
            ...rulesItem,
            parsedSourceReg,
            sourceReg: pathToRegexp(rulesItem.source),
            parsedDestinationReg: isRegPath ? parse(rulesItem.destination) : [rulesItem.destination],
            destinationToPath: isRegPath
                ? compile(rulesItem.destination, {
                    encode: encodeURIComponent,
                })
                : () => rulesItem.destination,
        };
    });
 
    return async function koaPathTransfrom(ctx, next) {
        const { path } = ctx;
        let pathExec;
        let rulesItem;
 
        if (pathMap.size > mapSize) {
            pathMap.delete(pathMap.keys()[0]);
        }
        if (pathMap.has(path)) {
            return await next();
        }
 
        for (const item of rulesList) {
            pathExec = item.sourceReg.exec(path);
            if (pathExec) {
                rulesItem = item;
                break;
            }
        }
 
        if (!rulesItem) {
            pathMap.set(path, false);
            return await next();
        }
        
        // no path params
        if (rulesItem.parsedSourceReg[0] === rulesItem.source) {
            rulesItem = { ...rulesItem, destinationPath: rulesItem.destination, params: {} };
            pathMap.set(path, rulesItem);
            return await next();
        }
        const params = rulesItem.parsedSourceReg.reduce((result, reg, index) => {
            if (Object.keys(reg).includes('name')) {
                return {
                    ...result,
                    [reg.name]: pathExec[index],
                };
            }
            return result;
        }, {});
        const destinationPath = decodeURIComponent(rulesItem.destinationToPath(params));
        rulesItem = { ...rulesItem, destinationPath, params };
        pathMap.set(path, rulesItem);
        return await next();
    };
};
 