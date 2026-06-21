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
		await newWeeklyObligations(env, ctx);
        await killStaleSessions(env, ctx);
		return new Response("Hello World!");
	},
	async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
        await newWeeklyObligations(env, ctx);
        switch (controller.cron) {
            case "0 0 * * SUN": {
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
    console.log("Checking for next week's obligation...");

    const now = new Date();

    // If today is Sunday, create/check next Sunday's obligation.
    const daysUntilNextSunday =
        now.getUTCDay() === 0
            ? 7
            : 7 - now.getUTCDay();

    const nextSunday = new Date(now);
    nextSunday.setUTCDate(
        nextSunday.getUTCDate() + daysUntilNextSunday
    );
    nextSunday.setUTCHours(0, 0, 0, 0);

    const startDate = Math.floor(nextSunday.getTime() / 1000);

    const existing = await env.AccountingDatabase.prepare(
        `
        SELECT 1
        FROM obligations
        WHERE start_date = ?
        LIMIT 1
        `
    )
        .bind(startDate)
        .first();

    if (existing) {
        console.log(
            `Obligation already exists for ${nextSunday.toISOString()}`
        );
        return;
    }

    console.log(
        `Creating obligation for ${nextSunday.toISOString()}`
    );

    await env.AccountingDatabase.prepare(
        `
        INSERT INTO obligations (
            start_date,
            amount,
            description
        )
        VALUES (?, ?, ?)
        `
    )
        .bind(
            startDate,
            30,
            "New weekly obligation"
        )
        .run();

    console.log("Weekly obligation created.");
}
async function killStaleSessions(env: Env, ctx: ExecutionContext) {
	console.log("Checking for stale sessions...");
	const sessions = await env.AccountingDatabase.prepare(
		"SELECT * FROM users WHERE session_expiry < strftime('%s', 'now', '-1 hour')"
	).all();
	console.log(`Found ${sessions.results.length} stale sessions.`);
	for (const session of sessions.results) {
		console.log(`Deleting session for ${session.email}...`);
		await env.AccountingDatabase.prepare(
			"UPDATE users SET session_expiry = NULL WHERE email = ?"
		).bind(session.email).run();
	}
	console.log("Stale sessions deleted.");
}
