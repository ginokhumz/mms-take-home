<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useTimelineStore } from '../stores/timeline';
import type { Post, PostId } from '../api/types';
import { VIEWER_ID } from '../api/mockControls';
import ComposeBox from './ComposeBox.vue';
import EditBox from './EditBox.vue';
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

const editing = ref<PostId | null>(null);

/**
 * The server sends editable_until only to the author while the window is open, so its presence is
 * the signal. The client deliberately does not also test it against its own clock: the field is
 * advisory, the server re-checks on save, and a browser clock that is minutes out would otherwise
 * hide a control that would have worked. A rejection is the real answer, and it renders as one.
 */
function canEdit(post: Post): boolean {
  return post.author.id === VIEWER_ID && post.editable_until !== undefined;
}

function openEdit(id: PostId): void {
  store.editError = null;
  editing.value = id;
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
          <button v-if="canEdit(post)" type="button" class="link" @click="openEdit(post.id)">
            Edit
          </button>
        </template>
        <template #footer>
          <EditBox v-if="editing === post.id" :post="post" @close="editing = null" />
          <!-- Keyed on the revision so that saving an edit remounts the panel and refetches:
               an open history that still showed the pre-edit list would be wrong. -->
          <RevisionsPanel
            v-if="openRevisions === post.id"
            :key="post.revision"
            :post-id="post.id"
          />
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

<style scoped>
.link {
  font: inherit;
  font-size: 0.8rem;
  background: none;
  border: none;
  padding: 0;
  color: #0b57d0;
  text-decoration: underline;
  cursor: pointer;
}
</style>
