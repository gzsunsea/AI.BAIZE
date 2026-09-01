import { FeedExperience, type FeedExperienceProps } from "../feed/FeedExperience";
import type { TopicDefinition } from "../../lib/experience.mts";

export function TopicPage({ definition, feedProps }: { definition: TopicDefinition; feedProps: FeedExperienceProps }) {
  return (
    <FeedExperience
      {...feedProps}
      mode={definition.key}
      pageTitle={definition.label}
      pageDescription={definition.description}
      hotTopics={[]}
      hotTopicsLoading={false}
      hotTopicsError=""
    />
  );
}
