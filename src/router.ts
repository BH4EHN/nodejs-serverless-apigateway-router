
type StringKeyValueDict = { [key: string]: string };

export interface HttpEventRequest {
    path: string;
    method: string;
    headers: StringKeyValueDict;
    pathParameters: StringKeyValueDict;
    queryStringParameters: StringKeyValueDict;
    body: string;
    isBodyBase64: boolean;

    sourceIp: string;
    requestId: string;
}

export interface HttpEventResponse {
    statusCode?: number;
    headers?: StringKeyValueDict;
    body?: string;
    isBodyBase64?: boolean;
}

export type RequestTransformer<T> = (event: T) => HttpEventRequest;
export type ResponseTransformer<T> = (event: HttpEventResponse) => T;
type RouteHandler = (request: HttpEventRequest) => Promise<HttpEventResponse>;
type RouteUnhandledErrorHandler = (request: HttpEventRequest, error: Error) => Promise<HttpEventResponse>;
type HttpMethod =  'ANY' | 'OPTIONS' | 'GET' | 'HEAD' | 'PUT' | 'POST' | 'DELETE' | 'PATCH';
const HttpMethodAny = 'ANY';

function timeEpochToISOString(epoch: number) {
    return (new Date(epoch * 1000)).toISOString();
}

function currentTimeISOString() {
    return (new Date()).toISOString();
}

class RouteTable {
    private readonly routes: Map<string, Map<string, RouteHandler>>;

    public constructor() {
        this.routes = new Map<string, Map<string, RouteHandler>>();
    }

    public set(path: string, method: HttpMethod, handler: RouteHandler) {
        const pathMap = this.routes;
        const hasMethodMap = pathMap.has(path);
        if (!hasMethodMap) {
            pathMap.set(path, new Map<HttpMethod, RouteHandler>());
        }
        const methodMap = pathMap.get(path)!;
        methodMap.set(method, handler);
    }

    public find(path: string, method: string): RouteHandler | null {
        const pathMap = this.routes;
        const hasMethodMap = pathMap.has(path);
        if (!hasMethodMap) {
            return null;
        }
        const methodMap = pathMap.get(path)!;
        if (methodMap.has(HttpMethodAny)) {
            return methodMap.get(HttpMethodAny)!;
        }
        if (!methodMap.has(method)) {
            return null;
        }
        return methodMap.get(method)!;
    }

}

export class Router<T, K> {

    private readonly requestTransformer: RequestTransformer<T>;
    private readonly responseTransformer: ResponseTransformer<K>;
    private readonly routeTable: RouteTable;
    private routeNotFoundHandler: RouteHandler;
    private routeUnhandledExceptionHandler: RouteUnhandledErrorHandler;

    public constructor(requestTransformer: RequestTransformer<T>, responseTransformer: ResponseTransformer<K>) {
        this.requestTransformer = requestTransformer;
        this.responseTransformer = responseTransformer;
        this.routeTable = new RouteTable();
        this.routeNotFoundHandler = this.routeNotFoundHandlerDefault;
        this.routeUnhandledExceptionHandler = this.routeUnhandledErrorHandlerDefault;
    }

    public async handle(event: T): Promise<K> {
        const request = this.requestTransformer(event);
        const handler = this.routeTable.find(request.path, request.method);
        let response: HttpEventResponse;
        try {
            if (handler === null) {
                response = await this.routeNotFoundHandler(request);
            } else {
                response = await handler(request);
            }
        } catch (error) {
            if (error instanceof Error) {
                try {
                    response = await this.routeUnhandledErrorHandlerDefault(request, error);
                } catch (error) {
                    if (error instanceof Error) {
                        response = await this.routeUnhandledErrorHandlerDefault(request, error);
                    } else {
                        response = await this.routeUnhandledErrorUnknownHandler(request, error);
                    }
                }
            } else {
                response = await this.routeUnhandledErrorUnknownHandler(request, error);
            }
        }
        return this.responseTransformer(response);
    }

    public setRoute(path: string, method: HttpMethod, handler: RouteHandler) {
        this.routeTable.set(path, method, handler);
    }

    public setRouteNotFoundHandler(handler: (request: HttpEventRequest) => Promise<HttpEventResponse>) {
        this.routeNotFoundHandler = handler;
    }

    public setRouteUnhandledExceptionHandler(handler: RouteUnhandledErrorHandler) {
        this.routeUnhandledExceptionHandler = handler;
    }

    private readonly routeNotFoundHandlerDefault: RouteHandler = async (request: HttpEventRequest): Promise<HttpEventResponse> => {
        return {
            statusCode: 404,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: request.path,
                method: request.method,
                requestId: request.requestId,
                time: currentTimeISOString,
                message: '404 Not Found'
            })
        };
    }

    private readonly routeUnhandledErrorHandlerDefault: RouteUnhandledErrorHandler = async (request: HttpEventRequest, error: Error) : Promise<HttpEventResponse> => {
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: request.path,
                method: request.method,
                time: currentTimeISOString,
                message: '500 Internal Server Error',
                detail: error.message
            })
        };
    }

    private readonly routeUnhandledErrorUnknownHandler = async (request: HttpEventRequest, error: unknown) : Promise<HttpEventResponse> => {
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                path: request.path,
                method: request.method,
                time: currentTimeISOString,
                message: '500 Internal Server Error',
                detail: 'Unknown'
            })
        };
    }
}