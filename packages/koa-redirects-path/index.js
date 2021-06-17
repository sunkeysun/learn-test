/**
 * koa-redirects-path index.js
 */
const querystring = require('querystring');
const { pathToRegexp, parse, compile } = require('path-to-regexp');

const MAX_CACHE_SIZE = 100;

module.exports = function ({ redirects, onRedirect = async () => {} }) {
    const redirectList = redirects.map((redirect) => {
        const parsedSourceReg = parse(redirect.source);
        const isRegPath = parsedSourceReg.length > 1;
        return {
            ...redirect,
            parsedSourceReg,
            sourceReg: pathToRegexp(redirect.source),
            parsedDestinationReg: isRegPath ? parse(redirect.destination) : [redirect.destination],
            destinationToPath: isRegPath
                ? compile(redirect.destination, {
                    encode: encodeURIComponent,
                })
                : () => redirect.destination,
        };
    });

    async function doRedirect(ctx, redirect) {
        const { query } = ctx;
        const { redirectPath, permanent = false } = redirect;
        let redirectUrl = redirectPath;
        if (Object.keys(query).length > 0) {
            redirectUrl = `${redirectPath}?${querystring.stringify(query)}`;
        }
        redirectUrl = redirectUrl.substr(0, 2000);
        ctx.status = permanent ? 301 : 302;
        ctx.redirect(redirectUrl);
        await onRedirect(ctx, {
            ...redirect,
            redirectUrl,
        });
    }

    return async function redirectsPath(ctx, next) {
        if (redirectList.length === 0) {
            return await next();
        }
        const { path } = ctx;
        if (!ctx.app.redirectsMap) {
            ctx.app.redirectsMap = new Map();
        } else if (ctx.app.redirectsMap.size > MAX_CACHE_SIZE) {
            ctx.app.redirectsMap.delete(ctx.app.redirectsMap.keys()[0])
        }
        if (ctx.app.redirectsMap.has(path)) {
            return await doRedirect(ctx, ctx.app.redirectsMap.get(path));
        } else if (ctx.app.redirectsMap.get(path) === null) {
            return await next();
        }

        let pathExec = null;
        let redirect = null;
        for (const item of redirectList) {
            pathExec = item.sourceReg.exec(path);
            if (pathExec) {
                redirect = item;
                break;
            }
        }

        if (!redirect) {
            ctx.app.redirectsMap.set(path, null);
            return await next();
        }
        if (redirect.parsedDestinationReg.length === 1) {
            redirect = {
                ...redirect,
                redirectPath: redirect.destination,
            };
            ctx.app.redirectsMap.set(path, redirect);

            return await doRedirect(ctx, redirect);
        }

        const params = redirect.parsedSourceReg.reduce((result, reg, index) => {
            if (Object.keys(reg).includes('name')) {
                return {
                    ...result,
                    [reg.name]: pathExec[index],
                };
            }
            return result;
        }, {});
        const redirectPath = redirect.destinationToPath(params);
        redirect = { ...redirect, redirectPath };
        ctx.app.redirectsMap.set(path, redirect)
        return await doRedirect(ctx, redirect);
    };
};
 