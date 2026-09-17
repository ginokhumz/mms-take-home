<script setup lang="ts">
import type { Post } from '../api/types';

defineProps<{ post: Post }>();

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'UTC', timeZoneName: 'short' });
}
</script>

<template>
  <!-- data-post-id exists so duplicate rendering can be checked in the DOM rather than by eye. -->
  <article class="post" :data-post-id="post.id">
    <header class="post-header">
      <span class="name">{{ post.author.display_name }}</span>
      <span class="handle">@{{ post.author.handle }}</span>
      <time :datetime="post.created_at">{{ formatTime(post.created_at) }}</time>
      <!-- Filled by the edited indicator and the edit affordance. -->
      <slot name="meta" />
    </header>

    <!-- Interpolation only. No v-html anywhere in this app: post text is untrusted user input and
         Vue's escaping is the whole defence against a stored cross-site scripting payload. -->
    <p class="post-text">{{ post.text }}</p>

    <!-- The image is one nullable object, never partially populated, so this single check is
         enough. A null alt means decorative: pass "" rather than the string "null". -->
    <img
      v-if="post.image !== null"
      :src="post.image.url"
      :alt="post.image.alt ?? ''"
      :width="post.image.width"
      :height="post.image.height"
      class="post-image"
    />

    <slot name="footer" />
  </article>
</template>

<style scoped>
.post {
  border-bottom: 1px solid #ddd;
  padding: 0.85rem 0;
}
.post-header {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  flex-wrap: wrap;
  font-size: 0.85rem;
  color: #555;
}
.name {
  font-weight: 600;
  color: #111;
}
.post-text {
  margin: 0.4rem 0 0;
  white-space: pre-wrap;
}
.post-image {
  max-width: 100%;
  height: auto;
  margin-top: 0.5rem;
}
</style>
