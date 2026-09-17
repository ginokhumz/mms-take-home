<script setup lang="ts">
import { onMounted } from 'vue';
import { useTimelineStore } from '../stores/timeline';
import PostCard from './PostCard.vue';
import ErrorPanel from './ErrorPanel.vue';
import DegradedBanner from './DegradedBanner.vue';

const store = useTimelineStore();
onMounted(() => void store.loadFirstPage());
</script>

<template>
  <section>
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
      <PostCard v-for="post in store.items" :key="post.id" :post="post" />

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
