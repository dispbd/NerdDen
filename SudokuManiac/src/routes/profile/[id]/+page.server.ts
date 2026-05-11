import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { userStats, gameSessions } from '$lib/server/db/schema';
import { user } from '$lib/server/db/auth.schema';
import { eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, locals }) => {
	// Resolve the target user
	const targetUser = await db.query.user.findFirst({ where: eq(user.id, params.id) });
	if (!targetUser) error(404, 'User not found');

	const stats = await db.query.userStats.findFirst({ where: eq(userStats.userId, params.id) });

	const history = await db
		.select({
			id: gameSessions.id,
			difficulty: gameSessions.difficulty,
			status: gameSessions.status,
			timeSpent: gameSessions.timeSpent,
			hintsUsed: gameSessions.hintsUsed,
			createdAt: gameSessions.createdAt,
			completedAt: gameSessions.completedAt
		})
		.from(gameSessions)
		.where(eq(gameSessions.userId, params.id))
		.orderBy(desc(gameSessions.createdAt))
		.limit(20);

	const isOwn = locals.user?.id === params.id;

	return {
		profile: {
			id: targetUser.id,
			name: targetUser.name,
			email: isOwn ? targetUser.email : null,
			image: targetUser.image,
			createdAt: targetUser.createdAt
		},
		stats: stats ?? null,
		history,
		isOwn
	};
};
