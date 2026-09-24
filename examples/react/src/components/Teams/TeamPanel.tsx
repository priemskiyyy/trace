import { UsersThree } from "@phosphor-icons/react";
import { useTrace } from "@priemskiyyy/trace-react";
import type React from "react";

import { CREWS, CREW_IDS } from "example-shared/boutique/users/constants/crews";
import type { CrewId } from "example-shared/boutique/users/types/CrewId";
import { buttonStyles } from "example-shared/ui/styles/buttonStyles";
import { Panel } from "src/components/Panel/Panel";

type TeamPanelProps = {
  crew: CrewId | null;
  onCrewSelect: (crewId: CrewId | null) => void;
};

export const TeamPanel: React.FunctionComponent<TeamPanelProps> = ({
  crew,
  onCrewSelect,
}) => {
  const trace = useTrace();

  const handleSelectPress = (crewId: CrewId) => {
    trace.group("crew", { id: crewId, traits: { size: CREWS[crewId].size } });
    onCrewSelect(crewId);
  };

  const handleLeavePress = () => {
    trace.group("crew", null);
    onCrewSelect(null);
  };

  return (
    <Panel
      title="Crew"
      icon={UsersThree}
      shows="Boutique's shopping crews: one group membership every destination that supports one can see."
    >
      <div role="group" aria-label="Crew" className="flex flex-wrap gap-2">
        {CREW_IDS.map((crewId) => (
          <button
            key={crewId}
            type="button"
            aria-pressed={crew === crewId}
            onClick={() => handleSelectPress(crewId)}
            className={buttonStyles({ pressed: crew === crewId })}
          >
            {CREWS[crewId].name}
          </button>
        ))}
      </div>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {crew === null ? "Not in a crew." : `In ${CREWS[crew].name}.`}
      </p>
      <button
        type="button"
        disabled={crew === null}
        onClick={handleLeavePress}
        className={buttonStyles({ variant: "ghost", size: "small" })}
      >
        Leave crew
      </button>
    </Panel>
  );
};
