module.exports = {
  tags: {
    // * is not a real tag so it only gets used for CSS
    "*": {
      global: true,
      inline: true,
      style: {
        margin: 0,
        padding: 0,
        "font-family": '"Roboto", Arial, sans-serif',
      },
    },
    table: {
      global: true,
      inline: true,
      style: {
        width: "600px",
        "max-width": "600px",
        "text-align": "left",
      },
      attrs: {
        cellspacing: 0,
        cellpadding: 0,
        border: 0,
      },
    },

    a: {
      global: true,
      inline: true,
      style: {
        color: "{CUSTOM_COLOR} !important",
      },
    },
    img: {
      global: true,
      inline: true,
      style: {
        width: "600px",
        "max-width": "100%",
      },
      attrs: {
        width: "600",
      },
    },
    figure: {
      global: true,
      inline: true,
      style: {
        "max-width": "600px",
        margin: 0,
      },
      attrs: {},
    },
    "figure.image": {
      global: true,
      inline: false,
      style: {
        width: "600px",
        "max-width": "600px",
      },
      attrs: {},
    },
    "figure img": {
      global: true,
      inline: false,
      style: {
        "width": "100%",
        "max-width": "600px",
      },
      attrs: {},
    },
    figcaption: {
      global: true,
      inline: true,
      style: {
        color: "lightgrey",
        "font-size": "0.9rem",
        "text-align": "center",
      },
      attrs: {},
    },
    td: {
      global: true,
      inline: false,
      style: {
        "max-width": "600px",
      },
      attrs: {},
    },
    h2: {
      global: true,
      inline: false,
      style: {
        "font-size": "24px",
        "line-height": 1.5,
        "margin-bottom": "1.2rem",
      },
      attrs: {},
    },
    p: {
      global: true,
      inline: false,
      style: {
        "line-height": 1.375,
        "margin-bottom": "1.2rem",
        "text-align": "left",
      },
      attrs: {},
    },
    //embedded tables
    "figure.table": {
      global: true,
      inline: false,
      style: {
        "line-height": 1.375,
      },
    },
    "figure.table td": {
      global: true,
      inline: false,
      style: {
        padding: "0px 10px 10px 10px",
      },
    },
    "figure.table td figure.image": {
      global: true,
      inline: false,
      style: {
        "max-width": "250px",
        margin: "auto",
      },
    },
    "figure.table td figure.image img": {
      global: true,
      inline: false,
      style: {
        "max-width": "250px",
      },
    },
    "figure.table p": {
      global: true,
      inline: false,
      style: {
        "margin-bottom": 0,
      },
    },
    // '.SocialHandle img': {
    //   global: true,
    //   inline: true,
    //   style: {
    //     'height': '35px',
    //     'width': '35px',
    //   },
    // },
  },
};
