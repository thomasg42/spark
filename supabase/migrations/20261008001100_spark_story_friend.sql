-- Family and friends share the relationship timeline. Existing entries are preserved.
alter type public.story_kind add value if not exists 'met_friend';
