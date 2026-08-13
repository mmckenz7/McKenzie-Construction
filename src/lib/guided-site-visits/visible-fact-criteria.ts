export const GUIDED_VISIBLE_FACT_CRITERIA: Record<
  string,
  readonly { key: string; label: string; guidance?: string }[]
> = {
  property_context: [
    {key:"house_elevation",label:"House elevation and work area"},{key:"entire_deck_area",label:"Entire deck or proposed area"},{key:"yard_grade_access",label:"Surrounding yard, grade, and access direction"},
  ],
  full_deck_yard: [
    {key:"deck_width_surface_edge",label:"Full deck width and surface edge"},{key:"stairs_railings",label:"Visible stairs and railings"},{key:"grade_below_deck",label:"Grade below the deck"},
  ],
  house_ledger: [
    {
      key: "ledger_connection",
      label: "Deck-to-house attachment area is visible",
      guidance:
        "This only confirms that the photo shows where the deck meets the house. It does not confirm that both ends of the ledger are visible.",
    },
    {
      key: "flashing_area",
      label: "Flashing area above the ledger is visible",
      guidance:
        "Show the area directly above the ledger where flashing should direct water away from the house.",
    },
    {
      key: "exterior_finish",
      label: "Wall finish above and below the ledger is visible",
      guidance:
        "Include enough wall around the ledger to show the siding, brick, or other exterior finish above and below it.",
    },
    {
      key: "ledger_end_conditions",
      label: "Left and right ends of the ledger are visible when accessible",
      guidance:
        "This is separate from simply seeing the ledger. Show the left end and the right end so each termination can be reviewed. Use two photos if both ends do not fit clearly in one picture.",
    },
  ],
  underside_framing: [
    {key:"joists_direction",label:"Joists and framing direction"},{key:"beam_locations",label:"Beam locations"},{key:"visible_blocking",label:"Visible blocking"},{key:"bearing_relationship",label:"Ledger or bearing relationship"},
  ],
  supports_footings: [
    {key:"support_lines",label:"Every visible support line"},{key:"post_beam_connections",label:"Post-to-beam connections"},{key:"post_bases",label:"Post bases"},{key:"footing_or_ground_entry",label:"Exposed footing tops or ground entry"},
  ],
  stairs_landings: [
    {key:"complete_stair_flight",label:"Complete stair flight"},{key:"top_connection_stringers",label:"Top connection and visible stringers"},{key:"treads_risers",label:"Treads and risers"},{key:"bottom_landing_grade",label:"Bottom landing and nearby grade"},
  ],
  guards_railings: [
    {key:"railing_sections",label:"Each different railing section"},{key:"railing_posts_attachments",label:"Posts and attachments"},{key:"corners_transitions",label:"Corners and transitions"},{key:"stair_handrail",label:"Stair handrail when present"},
  ],
  access_demolition: [
    {key:"street_route",label:"Route from street or driveway"},{key:"gates_passages",label:"Gates and narrow passages"},{key:"ground_constraints",label:"Slopes, soft ground, or landscaping"},{key:"staging_debris_route",label:"Staging and debris route"},
  ],
  utilities_obstructions: [
    {key:"visible_utilities",label:"Visible utilities and service equipment"},{key:"mechanical_equipment",label:"HVAC or mechanical equipment"},{key:"drainage",label:"Downspouts and drainage"},{key:"other_obstructions",label:"Trees, fences, walls, concrete, or other obstacles"},
  ],
};

export const VISIBLE_FACT_STATUSES=["visible","not_visible","unclear"] as const;
export const NEXT_CAPTURE_ACTIONS=["move_closer","step_back","change_angle","add_light","remove_obstruction","show_other_end"] as const;
export type VisibleFactStatus=typeof VISIBLE_FACT_STATUSES[number];
export type NextCaptureAction=typeof NEXT_CAPTURE_ACTIONS[number];
export type VisibleFactResult={criteria:{criterionKey:string;status:VisibleFactStatus}[];recommendedNextCapture:{criterionKey:string;actionCode:NextCaptureAction}|null};
