<script setup lang="ts">
import type { Post } from '../api/types';

const props = defineProps<{ post: Post }>();

// The contract names edit_count as the edited indicator, so that is the field this reads. Not
// edited_at being non-null, and not revision being above 1 — all three coincide today, but only
// one of them is the contract's answer, and picking a different one is how they drift apart.
const isEdited = (): boolean => props.post.edit_count > 0;

defineEmits<{ toggle: [] }>();
</script>

<template>
  <button v-if="isEdited()" type="button" class="edited" @click="$emit('toggle')">
    Edited{{ post.edit_count > 1 ? ` ×${post.edit_count}` : '' }}
  </button>
</template>

<style scoped>
.edited {
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
