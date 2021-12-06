const { Router } = require('../out/router')

const router = new Router((event) => {
    const requestContext = event.requestContext;
    return {
        path: event.path,
        method: event.httpMethod,
        headers: event.headers,
        queryStringParameters: event.queryStringParameters,
        body: event.body,
        isBodyBase64: event.isBase64Encoded,
        sourceIp: requestContext.sourceIp,
        requestId: requestContext.requestId
    };
}, (response) => {
    return {
        statusCode: response.statusCode || 200,
        headers: response.headers || {},
        body: response.body || '',
        isBase64Encoded: response.isBodyBase64 || false
    };
});
router.setRoute("/", "GET", async (request) => {
    return {
        statusCode: 200,
        body: `Hello ${(new Date()).toISOString()}`,
        isBodyBase64: false
    };
});

exports.handler = async (event) => {
    return router.handle(event);
};