import { Hono } from "hono";
/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
}

const app = new Hono()

// app.get('/', (c) => {
// 	// return c.text("Hello World!")
// 	return new Response("Hello World!");
// })

// app.get('/json', (c) => {
// 	return c.json({ hoge: 'fuga'});
// })

// 別のドメインでもなんでもいける
app.get('/example', () => {
	return fetch('https://example.com')
})

// レスポンスのHTMLの書き換え
app.get('/rewrite', async () => {
	const rewriter = new HTMLRewriter()
	const res = await fetch('https://example.com')
	rewriter.on('h1', { element: (e) => { e.setInnerContent('Test') } })
	return rewriter.transform(res)
})

// キャッシュ
app.get('/api/cache', async (c) => {
	// これでcloudflare workersのキャッシュAPIにアクセス可能
	const cache = caches.default
	const url = new URL(c.req.url)
	url.port = '3000'
	const matched = await cache.match(url)
	if (matched) return matched

	const res = await fetch(
		url,
		{
			headers: c.req.headers,
			body: c.req.body,
			// cloudflare workersだけのオプションを渡せる
			// 基本的にキャッシュキーはURL
			// proxy設定ちゃんとしないと動かないらしい?
			cf: {
				cacheTtl: 30,
			}
		},
	)
	const clonedRes = res.clone()
	// clonedRes.headers.set('Cache-Control', 'max-age=30')
	clonedRes.headers.set('Cache-Control', 's-maxage=30')
	// Cache-Controlはweb api。cloudflareもそれに沿っている
	// キャッシュしているのはworkers内
	cache.put(url, clonedRes)
	// cache.put(new Request(url), res)
	return clonedRes
})

// ABテスト
// どっちに行ったかはアクセスログで見れる
app.get('/ab/page', async (c) => {
	const url = new URL(c.req.url)
	url.port = '3000'
	const abPath = c.req.cookie('ab')

	if (abPath) {
		url.pathname = abPath
	} else {
		url.pathname = Math.random() < 0.5 ? '/ab/page-a' : '/ab/page-b'
	}

	const res = await fetch(url, { headers: c.req.headers, body: c.req.body })
	// read onlyなので
	const clonedRes = res.clone()
	// abは適当。本番では使わない
	clonedRes.headers.set('Set-Cookie', `ab=${url.pathname}`)
	return clonedRes
})

// 処理をブロックせずにレスポンスを返す(バックグラウンドで処理は行われる)
app.get('/async', async (c) => {
	const url = new URL(c.req.url)
	url.port = '3000'
	url.pathname = '/api/heavy'
	const handler: Promise<void> = new Promise(() => {
		fetch(url)
	})
	// honoでこれにアクセスする方法
	// https://developer.mozilla.org/ja/docs/Web/API/ExtendableEvent/waitUntil
	c.executionCtx.waitUntil(handler)
	return c.text('OK!')
})

// オリジンサーバーの情報を取得
app.all('*', (c) => {
	// c.req.url // http://localhost:8787/json
	const url = new URL(c.req.url)
	url.port = '3000'
	// honoは独自のrequestオブジェクトなのでこのように渡す
	return fetch(url, { headers: c.req.headers, body: c.req.body })
})

export default {
	async fetch(
		req: Request,
		_env: Env,
		ctx: ExecutionContext
	): Promise<Response> {
		// なんかしら例外起きた時は、オリジンサーバーに問い合わせる
		ctx.passThroughOnException()
		return app.fetch(req)
	},
};
