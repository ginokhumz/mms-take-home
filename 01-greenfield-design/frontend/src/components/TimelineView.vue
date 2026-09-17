<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useTimelineStore } from '../stores/timeline';
import type { PostId } from '../api/types';
import ComposeBox from './ComposeBox.vue';
import PostCard from './PostCard.vue';
import ErrorPanel from './ErrorPanel.vue';
import DegradedBanner from './DegradedBanner.vue';
import EditedIndicator from './EditedIndicator.vue';
import RevisionsPanel from './RevisionsPanel.vue';

const store = useTimelineStore();
onMounted(() => void store.loadFirstPage());

// One panel open at a time, and the history is fetched when it opens rather than with the page:
// most posts are never edited, so paying for their history on every timeline load would be waste.
const openRevisions = ref<PostId | null>(null);
function toggleRevisions(id: PostId): void {
  openRevisions.value = openRevisions.value === id ? null : id;
}
</script>

<template>
  <section>
    <!-- Compose sits above every state, including the error one: a timeline that failed to load
         is no reason to stop someone posting. Pending entries render inside it, above the list. -->
    <ComposeBox />

    <DegradedBanner v-if="store.degraded" />

    <p v-if="store.status === 'loading-first'">Loading your timeline…</p>

    <ErrorPanel
      v-else-if="store.status === 'error' && store.error"
      :error="store.error"
      :on-retry="() => void store.loadFirstPage()"
      :on-restart="() => void store.restart()"
    />

    <p v-else-if="store.isEmpty">
      Nothing here yet. Your timeline will fill up as you follow people.
    </p>

    <template v-else>
      <PostCard v-for="post in store.items" :key="post.id" :post="post">
        <template #meta>
          <EditedIndicator :post="post" @toggle="toggleRevisions(post.id)" />
        </template>
        <template #footer>
          <RevisionsPanel v-if="openRevisions === post.id" :post-id="post.id" />
        </template>
      </PostCard>

      <!-- Below the list, never in place of it: the reader keeps the posts they already had. -->
      <ErrorPanel
        v-if="store.loadMoreError"
        :error="store.loadMoreError"
        :on-retry="() => void store.loadMore()"
        :on-restart="() => void store.restart()"
      />

      <button v-if="store.canLoadMore" type="button" @click="void store.loadMore()">
        {{ store.status === 'loading-more' ? 'Loading…' : 'Load more' }}
      </button>
      <p v-else-if="store.status === 'loading-more'">Loading…</p>
      <p v-else-if="!store.hasMore">You have reached the end.</p>
    </template>
  </section>
</template>
