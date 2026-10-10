/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { parse } from "csv-parse";
import { newWeeklyObligations } from "./obligations";

async function timed<T>(fn: () => Promise<T>, key?: string): Promise<T> {
	console.log(`Starting ${key}`);
	const start = performance.now();
	try {
		const result = await fn();
		console.log(`Finished ${key} in ${performance.now() - start}ms`);
		return result;
	} catch (e) {
		console.log(`Failed ${key} in ${performance.now() - start}ms`);
		throw e;
	}
}

export default {
	async fetch(request: Request, env: Env) {
		await importStudentTransactions(env);
		await newWeeklyObligations(env.AccountingDatabase);
		// await killStaleSessions(env);
		return new Response('Hello World!');
	},
	async scheduled(controller: ScheduledController, env: Env) {
		await newWeeklyObligations(env.AccountingDatabase);
		switch (controller.cron) {
			case '0 0 * * SUN': {
				await newWeeklyObligations(env.AccountingDatabase);
				break;
			}
			case '0 * * * *': {
				// await killStaleSessions(env);
				break;
			}
		}
	},
} satisfies ExportedHandler<Env>;
async function importStudentTransactions(env: Env) {
	console.log("Importing student transactions...");
	const accountingDatabase = env.AccountingDatabase as D1Database;
	const IMPORT_URL = env.IMPORT_URL;
	const data = await timed(() => fetch(IMPORT_URL).then((res) => res.text()), 'Fetching CSV data');
	const parsed = parse(data, { columns: true });
	for (const row of parsed) {
		// weird empty row
		if (!row["ประทับเวลา"]) continue;
		const timestamp = extractDate(row["ประทับเวลา"]);
		const studentId = row["เลือกรหัสนิสิตของตัวเอง"].split(' ')[0] + "@tsu.ac.th";
		const stableKeyImport = `${studentId}-${timestamp.getTime()}`;

	}
}

// D/M/YYYY, HH:MM:SS
function extractDate(date: string) {
	const [d, m, y] = date.split(', ')[0].split('/').map(Number);
	const [h, min, s] = date.split(', ')[1].split(':').map(Number);
	return new Date(y, m - 1, d, h, min, s);
}

async function checkSlipOkCacheBeforeCallingSlipOkApi(
	db: D1Database,
	transactionId: number,
	slipObject: R2ObjectBody,
	amount: number,
	adminEmail: string
): Promise<SlipOkResponse> {
	const res = await db
		.prepare('SELECT * FROM slipok_cache WHERE transaction_id = ?')
		.bind(transactionId)
		.first<SlipOkCacheEntry>();
	if (!res) {
		try {
			const response = await checkSlip(await slipObject.arrayBuffer(), amount);
			await db
				.prepare('INSERT INTO slipok_cache (transaction_id, slipok_response) VALUES (?, ?)')
				.bind(transactionId, JSON.stringify(response))
				.run();
			await db
				.prepare('INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)')
				.bind(
					adminEmail,
					`Admin ${adminEmail} checked slip for transaction ${transactionId} from SlipOK API`,
					Math.floor(Date.now() / 1000)
				)
				.run();
			return response;
		} catch (err) {
			throw error(500, `SlipOK API isn't setup correctly or unreachable: ${err}`);
		}
	}
	await db
		.prepare('INSERT INTO logs (email, action, timestamp) VALUES (?, ?, ?)')
		.bind(
			adminEmail,
			`Admin ${adminEmail} checked slip for transaction ${transactionId} from cache`,
			Math.floor(Date.now() / 1000)
		)
		.run();
	return JSON.parse(res.slipok_response) as SlipOkResponse;
}
