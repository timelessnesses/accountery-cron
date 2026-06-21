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

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		return new Response("Hello World!");
	},
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
        switch (controller.cron) {
            case "0 0 * * 0": {
                await newWeeklyObligations(env, ctx);
                break;
            }
            case "0 * * * *": {
                await killStaleSessions(env, ctx);
                break;
            }

        }
    }
} satisfies ExportedHandler<Env>;
async function newWeeklyObligations(env: Env, ctx: ExecutionContext) {
	const obligations = await env.AccountingDatabase.prepare(
		"SELECT * FROM obligations WHERE start_date >= strftime('%s', 'now') AND start_date < strftime('%s', 'now', '+7 days')"
	).first();

	// check if there's no obligations for the next week, if there's none, create a new obligation for the next week that starts on sunday and ends on next saturday
	if (!obligations) {
		const nextSunday = new Date();
		nextSunday.setDate(nextSunday.getDate() + (7 - nextSunday.getDay()) % 7);
		const nextSaturday = new Date(nextSunday);
		nextSaturday.setDate(nextSaturday.getDate() + 6);
		await env.AccountingDatabase.prepare(
			"INSERT INTO obligations (start_date, end_date, amount, description) VALUES (?, ?, ?, ?)"
		)
			.bind(nextSunday.getTime() / 1000, nextSaturday.getTime() / 1000, 30, "New weekly obligation")
			.run();
	}
}

async function killStaleSessions(env: Env, ctx: ExecutionContext) {
	const sessions = await env.AccountingDatabase.prepare(
		"SELECT * FROM users WHERE session_expiry < strftime('%s', 'now', '-1 hour')"
	).all();
	for (const session of sessions.results) {
		await env.AccountingDatabase.prepare(
			"UPDATE users SET session_expiry = NULL WHERE email = ?"
		).bind(session.email).run();
	}
}
