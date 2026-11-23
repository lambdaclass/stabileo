use serde::{de, Deserialize, Deserializer};

pub(super) trait Numeric {
    fn is_finite(&self) -> bool;
}

impl Numeric for f64 {
    fn is_finite(&self) -> bool {
        f64::is_finite(*self)
    }
}

impl Numeric for usize {
    fn is_finite(&self) -> bool {
        true
    }
}

fn decode<'de, D, T>(deserializer: D, field: &str) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de> + Numeric,
{
    let value = T::deserialize(deserializer)
        .map_err(|error| de::Error::custom(format!("Invalid numeric input at {field} ({error})")))?;
    if !value.is_finite() {
        return Err(de::Error::custom(format!("Invalid numeric input at {field} (non-finite number)")));
    }
    Ok(value)
}

macro_rules! fields {
    ($($name:ident $(= $label:literal)?),+ $(,)?) => {
        $(
            pub(in crate::types) mod $name {
                use super::{decode, Deserialize, Deserializer, Numeric};

                #[allow(dead_code)]
                pub(in crate::types) fn required<'de, D, T>(deserializer: D) -> Result<T, D::Error>
                where
                    D: Deserializer<'de>,
                    T: Deserialize<'de> + Numeric,
                {
                    decode(deserializer, fields!(@label $name $(= $label)?))
                }

                #[allow(dead_code)]
                pub(in crate::types) fn optional<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
                where
                    D: Deserializer<'de>,
                    T: Deserialize<'de> + Numeric,
                {
                    required(deserializer).map(Some)
                }
            }
        )+
    };
    (@label $name:ident = $label:literal) => { $label };
    (@label $name:ident) => { stringify!($name) };
}

fields!(
    a,
    alpha,
    angle,
    b,
    bimoment,
    bw,
    density,
    depth,
    depth_y = "depthY",
    depth_z = "depthZ",
    direction,
    drx,
    dry,
    dry_or_drz = "dry/drz",
    drz,
    dt_gradient = "dtGradient",
    dt_gradient_y = "dtGradientY",
    dt_gradient_z = "dtGradientZ",
    dt_uniform = "dtUniform",
    dx,
    dy,
    dz,
    dz_or_dy = "dz/dy",
    e,
    eccentricity_i = "eccentricityI",
    eccentricity_j = "eccentricityJ",
    edge,
    element_id = "elementId",
    force,
    fx,
    fy,
    fz,
    fz_or_fy = "fz/fy",
    gravity_axis = "gravityAxis",
    gx,
    gy,
    gz,
    id,
    kappa,
    krx,
    kry,
    krz,
    kw,
    kx,
    ky,
    kz,
    mu,
    mx,
    my,
    my_or_mz = "my/mz",
    mz,
    node_id = "nodeId",
    normal_x = "normalX",
    normal_y = "normalY",
    normal_z = "normalZ",
    nu,
    offset,
    p,
    pressure,
    px,
    py,
    pz,
    q_i = "qI",
    q_j = "qJ",
    q_xi = "qXI",
    q_xj = "qXJ",
    q_yi = "qYI",
    q_yj = "qYJ",
    q_zi = "qZI",
    q_zj = "qZJ",
    qn,
    qt,
    ratio,
    weight,
);
