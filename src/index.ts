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
	async fetch(request: Request, env: Env) {
		await newWeeklyObligations(env);
        // await killStaleSessions(env);
		return new Response("Hello World!");
	},
	async scheduled(controller: ScheduledController, env: Env) {
        await newWeeklyObligations(env);
        switch (controller.cron) {
            case "0 0 * * SUN": {
                await newWeeklyObligations(env);
                break;
            }
            case "0 * * * *": {
                // await killStaleSessions(env);
                break;
            }

        }
    }
} satisfies ExportedHandler<Env>;
async function newWeeklyObligations(env: Env) {
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
