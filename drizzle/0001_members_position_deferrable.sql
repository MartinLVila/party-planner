ALTER TABLE "members" ADD CONSTRAINT "members_party_position" UNIQUE ("party_id", "position") DEFERRABLE INITIALLY DEFERRED;
