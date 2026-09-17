<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getRevisions } from '../api/client';
import { ApiError } from '../api/errors';
import type { PostId, Revision } from '../api/types';
import ErrorPanel from './ErrorPanel.vue';

const props = defineProps<{ postId: PostId }>();

const state = ref<'loading' | 'ready' | 'error'>('loading');
const revisions = ref<Revision[]>([]);
const error = ref<ApiError | null>(null);

async function load(): Promise<void> {
  state.value = 'loading';
  error.value = null;
  try {
    const response = await getRevisions(props.postId);
    // Served newest first, so no client-side sorting: re-sorting here would hide a server-side
    // ordering bug rather than surface it.
    revisions.value = response.revisions;
    state.value = 'ready';
  } catch (e) {
    error.value =
      e instanceof ApiError
        ? e
        : new ApiError({
            status: 500,
            code: 'internal_error',
            message: 'Something went wrong. Please try again.',
            retryable: true,
            requestId: 'local',
          });
    state.value = 'error';
  }
}

onMounted(() => void load());

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'UTC', timeZoneName: 'short' });
}
</script>

<template>
  <div class="revisions">
    <p v-if="state === 'loading'" class="muted">Loading edit history…</p>

    <!-- The same error component as everywhere else, so there is exactly one error rendering
         path in the app and the retry rule cannot be implemented twice, differently. -->
    <ErrorPanel v-else-if="error" :error="error" :on-retry="() => void load()" />

    <ol v-else>
      <li v-for="rev in revisions" :key="rev.revision">
        <span class="muted">v{{ rev.revision }} · {{ formatTime(rev.created_at) }}</span>
        <p>{{ rev.text }}</p>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.revisions {
  border-left: 3px solid #ccc;
  margin: 0.5rem 0 0 0.5rem;
  padding-left: 0.75rem;
  font-size: 0.9rem;
}
ol {
  margin: 0;
  padding-left: 1.2rem;
}
li {
  margin-bottom: 0.5rem;
}
li p {
  margin: 0.15rem 0 0;
  white-space: pre-wrap;
}
.muted {
  color: #666;
  font-size: 0.8rem;
}
</style>
