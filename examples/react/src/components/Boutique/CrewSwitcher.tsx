import type React from "react";

import { CREW_IDS, CREWS } from "example-shared/boutique/users/constants/crews";
import type { CrewId } from "example-shared/boutique/users/types/CrewId";
import { PILL_CLASS_NAME } from "example-shared/ui/styles/pillStyles";
import { segmentStyles } from "example-shared/ui/styles/segmentStyles";

type CrewSwitcherProps = {
  crew: CrewId | null;
  onCrewSelect: (crew: CrewId | null) => void;
};

export const CrewSwitcher: React.FunctionComponent<CrewSwitcherProps> = ({
  crew,
  onCrewSelect,
}) => (
  <div role="group" aria-label="Crew" className={PILL_CLASS_NAME}>
    <button
      type="button"
      aria-pressed={crew === null}
      onClick={() => onCrewSelect(null)}
      className={segmentStyles({ selected: crew === null })}
    >
      No crew
    </button>
    {CREW_IDS.map((id) => (
      <button
        key={id}
        type="button"
        aria-pressed={id === crew}
        onClick={() => onCrewSelect(id)}
        className={segmentStyles({ selected: id === crew })}
      >
        {CREWS[id].name}
      </button>
    ))}
  </div>
);
