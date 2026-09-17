<script setup lang="ts">
import { computed } from 'vue';
import { useTimelineStore } from '../stores/timeline';
import ErrorPanel from './ErrorPanel.vue';

const store = useTimelineStore();

// Counted the same way the server counts it: Unicode code points after NFC normalisation. A family
// emoji is one character on both sides, so the counter never disagrees with the validator.
const length = computed(() => [...store.draft.normalize('NFC')].length);
const canPost = computed(() => length.value >= 1 && length.value <= 500);

function submit(): void {
  if (!canPost.value) return;
  void store.publish(store.draft);
}
</script>

<template>
  <section class="compose">
    <!-- A terminal failure removed the optimistic entry, so its error belongs here, above the
         restored text. No retry affordance: the response said retrying cannot help. -->
    <ErrorPanel v-if="store.composeError" :error="store.composeError" />

    <textarea
      v-model="store.draft"
      rows="3"
      placeholder="What's happening?"
      aria-label="Write a post"
    ></textarea>

    <div class="compose-actions">
      <span :class="{ over: length > 500 }">{{ length }} / 500</span>
      <button type="button" :disabled="!canPost" @click="submit">Post</button>
    </div>

    <!-- Optimistic entries live above the confirmed list and are never mixed into it. Each one
         owns its own error, so two failed publishes show two messages rather than one. -->
    <article v-for="entry in store.pending" :key="entry.localId" class="pending">
      <p class="pending-text">{{ entry.text }}</p>
      <p v-if="!entry.error" class="muted">Posting…</p>
      <ErrorPanel
        v-else
        :error="entry.error"
        :on-retry="() => void store.retryPending(entry.localId)"
      />
    </article>
  </section>
</template>

<style scoped>
.compose {
  margin-bottom: 1rem;
}
textarea {
  width: 100%;
  font: inherit;
  padding: 0.5rem;
  box-sizing: border-box;
}
.compose-actions {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  justify-content: flex-end;
  margin-top: 0.4rem;
  font-size: 0.85rem;
}
.over {
  color: #b3261e;
  font-weight: 600;
}
.pending {
  border-left: 3px solid #999;
  padding: 0.5rem 0.75rem;
  margin-top: 0.6rem;
  background: #f7f7f7;
}
.pending-text {
  margin: 0;
  white-space: pre-wrap;
}
.muted {
  color: #666;
  font-size: 0.8rem;
  margin: 0.3rem 0 0;
}
</style>
