import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/reset-acass')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get('token');
        if (token !== 'acass-2026-fix') {
          return new Response('Forbidden', { status: 403 });
        }
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const userId = '8ff64c8c-3b7a-49f8-9385-2e762dea51b6';
        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: '@Cynara15W',
          email_confirm: true,
        });
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  },
});
